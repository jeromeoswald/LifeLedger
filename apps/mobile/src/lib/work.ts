import { useEffect, useState } from 'react';
import { nextOccurrence, type DailyLog, type Task, type TimeSession } from '@lifeledger/shared';
import { getCached, newBase, newId, nowIso, removeRecord, saveRecord, useList } from './records';

export const useTasks = () => useList<Task>('tasks');
export const useSessions = () => useList<TimeSession>('time-sessions');
export const useDailyLogs = () => useList<DailyLog>('daily-logs');

export const runningSession = (sessions: TimeSession[] = []) => sessions.find((s) => !s.endedAt && !s.deletedAt);

export async function stopTimer() {
  const running = runningSession(getCached<TimeSession>('time-sessions'));
  if (running) await saveRecord('time-sessions', { ...running, endedAt: nowIso() });
}

/** One timer at a time: starting a task stops whatever was running. */
export async function startTimer(task: Task) {
  await stopTimer();
  const now = nowIso();
  await saveRecord<TimeSession>('time-sessions', { ...newBase(), taskId: task.clientId, startedAt: now, endedAt: null });
  if (task.status === 'todo') await saveRecord('tasks', { ...task, status: 'in_progress' });
}

export async function setTaskDone(task: Task, done: boolean, tz: string) {
  if (!done) return saveRecord('tasks', { ...task, status: 'todo', completedAt: null });

  const running = runningSession(getCached<TimeSession>('time-sessions'));
  if (running?.taskId === task.clientId) await stopTimer();
  const ok = await saveRecord('tasks', { ...task, status: 'done', completedAt: nowIso() });

  const next = ok ? nextOccurrence(task, tz, newId) : null;
  if (!next) return ok;
  // Don't spawn twice if the task is un-ticked and ticked again.
  const exists = getCached<Task>('tasks').some(
    (t) => t.title === task.title && t.project === task.project && t.dueDate === next.dueDate && !t.deletedAt,
  );
  if (exists) return ok;
  return saveRecord<Task>('tasks', { ...task, ...newBase(), ...next, status: 'todo', completedAt: null });
}

export async function deleteTask(task: Task) {
  const running = runningSession(getCached<TimeSession>('time-sessions'));
  if (running?.taskId === task.clientId) await stopTimer();
  return removeRecord('tasks', task.clientId);
}

export function saveDailyLog(date: string, fields: Pick<DailyLog, 'done' | 'blockers' | 'tomorrow'>) {
  // shortcut: one log per date on this device; Phase 6 sync merges same-date logs from two devices.
  const existing = getCached<DailyLog>('daily-logs').find((l) => l.date === date && !l.deletedAt);
  return saveRecord<DailyLog>('daily-logs', { ...(existing ?? { ...newBase(), date }), ...fields });
}

/** Re-renders every second while `active` (for live timers). */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function useToday(tz: string) {
  const now = useNow(false);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
}

export function projectsOf(tasks: Task[] = []) {
  return [...new Set(tasks.filter((t) => !t.deletedAt && t.project).map((t) => t.project))].sort();
}
