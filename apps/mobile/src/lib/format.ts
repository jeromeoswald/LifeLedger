import { addDays, type Task } from '@lifeledger/shared';

const LOCALE = 'en-AE';
// Format calendar dates as UTC noon so the device time zone can't shift the day.
const asDate = (d: string) => new Date(`${d}T12:00:00Z`);

export const formatDate = (d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: 'UTC' }).format(asDate(d));

export const formatLongDate = (d: string) =>
  formatDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const formatMonth = (d: string) => formatDate(d, { month: 'long', year: 'numeric' });

export function relativeDay(d: string, today: string) {
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  if (d === addDays(today, -1)) return 'Yesterday';
  return formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function dueLabel(t: Pick<Task, 'dueDate' | 'dueTime'>, today: string) {
  if (!t.dueDate) return null;
  return `${relativeDay(t.dueDate, today)}${t.dueTime ? ` ${t.dueTime}` : ''}`;
}

export const PRIORITY_STYLE = {
  urgent: { label: 'Urgent', dot: 'bg-red-500' },
  high: { label: 'High', dot: 'bg-orange-500' },
  medium: { label: 'Medium', dot: 'bg-sky-500' },
  low: { label: 'Low', dot: 'bg-slate-400' },
} as const;

export const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' } as const;

export const clock = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
