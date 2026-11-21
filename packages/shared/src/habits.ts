import { addDays, dateRange, localDate, startOfWeek, weekday } from './dates';
import type { Habit, HabitEntry } from './schemas/habits';

type H = Pick<Habit, 'clientId' | 'target' | 'schedule' | 'startDate'>;

/** date -> value for one habit; duplicates (two devices) resolve to the latest edit. */
export function habitValues(entries: HabitEntry[], habitId: string): Map<string, number> {
  const best = new Map<string, HabitEntry>();
  for (const e of entries) {
    if (e.habitId !== habitId || e.deletedAt) continue;
    const prev = best.get(e.date);
    if (!prev || e.updatedAt > prev.updatedAt) best.set(e.date, e);
  }
  return new Map([...best].map(([d, e]) => [d, e.value]));
}

export const isScheduled = (h: Pick<Habit, 'schedule'>, date: string) =>
  h.schedule.kind !== 'weekdays' || h.schedule.days.includes(weekday(date));

/** Days with a note for one habit, newest first. */
export function habitNotes(entries: HabitEntry[], habitId: string): { date: string; note: string }[] {
  const latest = new Map<string, HabitEntry>();
  for (const e of entries) {
    if (e.habitId !== habitId || e.deletedAt) continue;
    const prev = latest.get(e.date);
    if (!prev || e.updatedAt > prev.updatedAt) latest.set(e.date, e);
  }
  return [...latest.values()]
    .filter((e) => e.note)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => ({ date: e.date, note: e.note }));
}

/** First day stats count from: the start date, or an earlier back-filled entry. */
function firstDay(h: H, values: Map<string, number>) {
  let first = h.startDate;
  for (const [d, v] of values) if (v > 0 && d < first) first = d;
  return first;
}

function maxRun(flags: boolean[]) {
  let best = 0;
  let run = 0;
  for (const f of flags) {
    run = f ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Done/total completions per Monday-start week, oldest first. */
function weeks(h: H, values: Map<string, number>, today: string) {
  const out: { week: string; done: number }[] = [];
  for (let w = startOfWeek(firstDay(h, values)); w <= today; w = addDays(w, 7)) {
    const done = dateRange(w, addDays(w, 6)).filter((d) => d <= today && (values.get(d) ?? 0) >= h.target).length;
    out.push({ week: w, done });
  }
  return out;
}

export interface HabitStats {
  today: string;
  doneToday: boolean;
  valueToday: number;
  /** streak unit: 'days' for daily/weekdays (scheduled days only), 'weeks' for X-per-week */
  unit: 'days' | 'weeks';
  current: number;
  best: number;
  /** completion rate over the last 30 days (0..1), null if nothing was due yet */
  rate30: number | null;
  /** X-per-week only: completions this week */
  thisWeek: number;
  /** should it show up in "habits to tick" today */
  dueToday: boolean;
}

/**
 * Streaks and completion in the user's time zone. Today never breaks a streak while it's still
 * pending: an unfinished today (or unfinished current week) is simply not counted yet.
 */
export function habitStats(h: H, entries: HabitEntry[], now: Date, tz: string): HabitStats {
  const today = localDate(now, tz);
  const values = habitValues(entries, h.clientId);
  const done = (d: string) => (values.get(d) ?? 0) >= h.target;
  const valueToday = values.get(today) ?? 0;
  const from30 = addDays(today, -29);

  if (h.schedule.kind === 'perWeek') {
    const times = h.schedule.times;
    const ws = weeks(h, values, today);
    const met = ws.map((w) => w.done >= times);
    const thisWeek = ws.at(-1)?.done ?? 0;
    // current: skip the running week if it isn't met yet
    let i = met.length - 1;
    if (i >= 0 && !met[i]) i--;
    let current = 0;
    while (i >= 0 && met[i]) {
      current++;
      i--;
    }
    // last 30 days: weeks overlapping the window; the running week only counts once it's met
    const recent = ws.filter((w) => addDays(w.week, 6) >= from30);
    const counted = recent.filter((w, idx) => idx < recent.length - 1 || w.done >= times);
    const rate30 = counted.length ? counted.reduce((n, w) => n + Math.min(w.done, times), 0) / (counted.length * times) : null;
    return {
      today,
      doneToday: done(today),
      valueToday,
      unit: 'weeks',
      current,
      best: maxRun(met),
      rate30,
      thisWeek,
      dueToday: thisWeek < times && !done(today),
    };
  }

  const start = firstDay(h, values);
  const days = start <= today ? dateRange(start, today).filter((d) => isScheduled(h, d)) : [];
  const flags = days.map(done);
  // pending today doesn't break the streak
  let i = days.length - 1;
  if (i >= 0 && days[i] === today && !flags[i]) i--;
  let current = 0;
  while (i >= 0 && flags[i]) {
    current++;
    i--;
  }
  const window = days.filter((d) => d >= from30 && (d < today || done(d)));
  const rate30 = window.length ? window.filter(done).length / window.length : null;
  return {
    today,
    doneToday: done(today),
    valueToday,
    unit: 'days',
    current,
    best: maxRun(flags),
    rate30,
    thisWeek: 0,
    dueToday: isScheduled(h, today) && !done(today),
  };
}

/** Heatmap grid: `count` Monday-start weeks ending with the current week (oldest first). */
export function heatmapWeeks(today: string, count = 17): string[][] {
  const last = startOfWeek(today);
  return Array.from({ length: count }, (_, i) => {
    const w = addDays(last, -7 * (count - 1 - i));
    return dateRange(w, addDays(w, 6));
  });
}

export function describeSchedule(s: Habit['schedule']): string {
  if (s.kind === 'daily') return 'Every day';
  if (s.kind === 'perWeek') return `${s.times}× a week`;
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = [...s.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Weekdays';
  return days.map((d) => names[d]).join(', ');
}
