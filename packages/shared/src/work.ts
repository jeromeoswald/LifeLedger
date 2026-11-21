import {
  addDays,
  addMonths,
  dateRange,
  daysBetween,
  daysInMonth,
  localDate,
  localTime,
  parseDate,
  startOfWeek,
  weekday,
  zonedToInstant,
} from './dates';
import type { Alarm, Priority, Recurrence, Task, TimeSession } from './schemas/work';

// ---------- recurrence ----------

/** Next due date strictly after `due` for a repeating task. */
export function nextDueDate(due: string, r: Recurrence): string {
  if (r.freq === 'daily') return addDays(due, r.interval);
  if (r.freq === 'monthly') return addMonths(due, r.interval, r.monthDay ?? parseDate(due).d);
  if (!r.weekdays.length) return addDays(due, 7 * r.interval);
  const week0 = startOfWeek(due);
  for (let i = 1; i <= 7 * r.interval + 7; i++) {
    const c = addDays(due, i);
    const weeks = daysBetween(week0, startOfWeek(c)) / 7;
    if (r.weekdays.includes(weekday(c)) && weeks % r.interval === 0) return c;
  }
  throw new Error('unreachable: weekly recurrence found no date');
}

/**
 * Fields for the next occurrence of a completed repeating task. Fixed-time alarms move by the
 * same number of days (same wall-clock time); "before due" alarms follow the new due date.
 */
export function nextOccurrence(task: Task, tz: string, newId: () => string) {
  if (!task.recurrence || !task.dueDate) return null;
  const dueDate = nextDueDate(task.dueDate, task.recurrence);
  const shift = daysBetween(task.dueDate, dueDate);
  const alarms: Alarm[] = task.alarms.map((a) => {
    if (a.kind !== 'at' || !a.at) return { ...a, id: newId() };
    const at = new Date(a.at);
    return { ...a, id: newId(), at: zonedToInstant(addDays(localDate(at, tz), shift), localTime(at, tz), tz).toISOString() };
  });
  return { dueDate, alarms };
}

// ---------- alarms ----------

/** When an alarm should fire, or null if it can't be computed. */
export function alarmTime(task: Pick<Task, 'dueDate' | 'dueTime'>, alarm: Alarm, tz: string): Date | null {
  if (alarm.kind === 'at') return alarm.at ? new Date(alarm.at) : null;
  if (!task.dueDate || !task.dueTime || alarm.minutesBefore === null) return null;
  return new Date(zonedToInstant(task.dueDate, task.dueTime, tz).getTime() - alarm.minutesBefore * 60_000);
}

// ---------- today view ----------

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function sortTasks<T extends Pick<Task, 'priority' | 'dueDate' | 'dueTime' | 'title'>>(tasks: T[]): T[] {
  return [...tasks].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
      (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') ||
      a.title.localeCompare(b.title),
  );
}

/**
 * Today view:
 * - overdue: open tasks due before today
 * - today: tasks due today (open first), plus anything completed today
 * - carryOver: open tasks without a due date that were already started (in progress / blocked)
 */
export function groupToday(tasks: Task[], today: string, tz: string) {
  const open = (t: Task) => t.status !== 'done';
  const live = tasks.filter((t) => !t.deletedAt);
  const doneToday = (t: Task) => !open(t) && !!t.completedAt && localDate(new Date(t.completedAt), tz) === today;
  return {
    overdue: sortTasks(live.filter((t) => open(t) && t.dueDate !== null && t.dueDate < today)),
    today: [
      ...sortTasks(live.filter((t) => open(t) && t.dueDate === today)),
      ...live.filter((t) => doneToday(t) || (!open(t) && t.dueDate === today && !t.completedAt)),
    ],
    carryOver: sortTasks(live.filter((t) => open(t) && !t.dueDate && t.status !== 'todo')),
  };
}

// ---------- reports ----------

export type Period = 'day' | 'week' | 'month';

export function periodRange(period: Period, anchor: string): { start: string; end: string } {
  if (period === 'day') return { start: anchor, end: anchor };
  if (period === 'week') {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 6) };
  }
  const { y, m } = parseDate(anchor);
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${daysInMonth(y, m)}` };
}

export const shiftPeriod = (period: Period, anchor: string, dir: 1 | -1) =>
  period === 'day' ? addDays(anchor, dir) : period === 'week' ? addDays(anchor, 7 * dir) : addMonths(anchor, dir, 1);

export const sessionSeconds = (s: Pick<TimeSession, 'startedAt' | 'endedAt'>, now: Date) =>
  Math.max(0, Math.round(((s.endedAt ? new Date(s.endedAt) : now).getTime() - new Date(s.startedAt).getTime()) / 1000));

export const NO_PROJECT = 'No project';

/** Tasks done and time tracked per day and per project, in the user's time zone. */
export function workReport(tasks: Task[], sessions: TimeSession[], start: string, end: string, tz: string, now: Date) {
  const byId = new Map(tasks.map((t) => [t.clientId, t]));
  const days = new Map(dateRange(start, end).map((d) => [d, { date: d, done: 0, seconds: 0 }]));
  const projects = new Map<string, { project: string; done: number; seconds: number }>();
  const proj = (name: string) => {
    const key = name || NO_PROJECT;
    let p = projects.get(key);
    if (!p) projects.set(key, (p = { project: key, done: 0, seconds: 0 }));
    return p;
  };

  for (const t of tasks) {
    if (t.deletedAt || t.status !== 'done' || !t.completedAt) continue;
    const day = days.get(localDate(new Date(t.completedAt), tz));
    if (!day) continue;
    day.done++;
    proj(t.project).done++;
  }
  // shortcut: a session is counted on the day it started, even if it runs past midnight.
  for (const s of sessions) {
    if (s.deletedAt) continue;
    const day = days.get(localDate(new Date(s.startedAt), tz));
    if (!day) continue;
    const secs = sessionSeconds(s, now);
    day.seconds += secs;
    proj(byId.get(s.taskId)?.project ?? '').seconds += secs;
  }

  const dayList = [...days.values()];
  return {
    days: dayList,
    projects: [...projects.values()].sort((a, b) => b.seconds - a.seconds || b.done - a.done),
    totalDone: dayList.reduce((n, d) => n + d.done, 0),
    totalSeconds: dayList.reduce((n, d) => n + d.seconds, 0),
  };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
