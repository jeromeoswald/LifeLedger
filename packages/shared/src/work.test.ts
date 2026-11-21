import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  localDate,
  localTime,
  startOfWeek,
  zonedToInstant,
} from './dates';
import { taskSchema, timeSessionSchema, type Task, type TimeSession } from './schemas/work';
import { alarmTime, groupToday, nextDueDate, nextOccurrence, periodRange, shiftPeriod, workReport } from './work';

const DXB = 'Asia/Dubai';
const iso = (s: string) => new Date(s).toISOString();
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function task(p: Partial<Task> = {}): Task {
  return taskSchema.parse({
    clientId: uuid(),
    createdAt: iso('2026-01-01T00:00:00Z'),
    updatedAt: iso('2026-01-01T00:00:00Z'),
    title: 'T',
    ...p,
  });
}
const session = (p: Partial<TimeSession>): TimeSession =>
  timeSessionSchema.parse({ clientId: uuid(), createdAt: iso('2026-01-01T00:00:00Z'), updatedAt: iso('2026-01-01T00:00:00Z'), ...p });

describe('dates', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('clamps month arithmetic', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
  });
  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16'); // Sunday → previous Monday
    expect(startOfWeek('2026-11-16')).toBe('2026-11-16');
  });
  it('uses the user time zone for the local date', () => {
    const t = new Date('2026-11-21T21:30:00Z'); // 01:30 on the 22nd in Dubai
    expect(localDate(t, DXB)).toBe('2026-11-22');
    expect(localDate(t, 'UTC')).toBe('2026-11-21');
    expect(localTime(t, DXB)).toBe('01:30');
  });
  it('converts wall time to an instant, including across DST', () => {
    expect(zonedToInstant('2026-11-22', '09:00', DXB).toISOString()).toBe('2026-11-22T05:00:00.000Z');
    expect(zonedToInstant('2026-07-01', '09:00', 'Europe/London').toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(zonedToInstant('2026-12-01', '09:00', 'Europe/London').toISOString()).toBe('2026-12-01T09:00:00.000Z');
  });
});

describe('recurrence', () => {
  it('daily and every-N-days', () => {
    expect(nextDueDate('2026-11-30', { freq: 'daily', interval: 1, weekdays: [], monthDay: null })).toBe('2026-12-01');
    expect(nextDueDate('2026-11-30', { freq: 'daily', interval: 3, weekdays: [], monthDay: null })).toBe('2026-12-03');
  });
  it('weekly on chosen weekdays', () => {
    const r = { freq: 'weekly' as const, interval: 1, weekdays: [1, 3, 5], monthDay: null }; // Mon/Wed/Fri
    expect(nextDueDate('2026-11-16', r)).toBe('2026-11-18'); // Mon → Wed
    expect(nextDueDate('2026-11-20', r)).toBe('2026-11-23'); // Fri → next Mon
  });
  it('every 2 weeks skips the off week', () => {
    const r = { freq: 'weekly' as const, interval: 2, weekdays: [1], monthDay: null };
    expect(nextDueDate('2026-11-16', r)).toBe('2026-11-30');
  });
  it('monthly keeps the 31st instead of drifting', () => {
    const r = { freq: 'monthly' as const, interval: 1, weekdays: [], monthDay: 31 };
    const feb = nextDueDate('2026-01-31', r);
    expect(feb).toBe('2026-02-28');
    expect(nextDueDate(feb, r)).toBe('2026-03-31');
  });
  it('next occurrence moves fixed alarms by the same days at the same local time', () => {
    const t = task({
      dueDate: '2026-11-22',
      dueTime: '10:00',
      recurrence: { freq: 'daily', interval: 1, weekdays: [], monthDay: null },
      alarms: [
        { id: 'a', kind: 'at', at: zonedToInstant('2026-11-22', '08:00', DXB).toISOString(), minutesBefore: null, style: 'alarm' },
        { id: 'b', kind: 'before', at: null, minutesBefore: 15, style: 'reminder' },
      ],
    });
    const next = nextOccurrence(t, DXB, () => 'new')!;
    expect(next.dueDate).toBe('2026-11-23');
    expect(next.alarms[0]!.at).toBe('2026-11-23T04:00:00.000Z');
    expect(next.alarms[1]).toMatchObject({ kind: 'before', minutesBefore: 15, id: 'new' });
    expect(alarmTime({ dueDate: next.dueDate, dueTime: '10:00' }, next.alarms[1]!, DXB)?.toISOString()).toBe('2026-11-23T05:45:00.000Z');
  });
});

describe('today view', () => {
  it('groups overdue, today and carry-over', () => {
    const today = '2026-11-22';
    const g = groupToday(
      [
        task({ title: 'late', dueDate: '2026-11-20' }),
        task({ title: 'low today', dueDate: today, priority: 'low' }),
        task({ title: 'urgent today', dueDate: today, priority: 'urgent' }),
        task({ title: 'started', status: 'in_progress' }),
        task({ title: 'someday' }),
        task({ title: 'done today', status: 'done', completedAt: iso('2026-11-22T06:00:00Z') }),
        task({ title: 'gone', dueDate: today, deletedAt: iso('2026-11-22T06:00:00Z') }),
      ],
      today,
      DXB,
    );
    expect(g.overdue.map((t) => t.title)).toEqual(['late']);
    expect(g.today.map((t) => t.title)).toEqual(['urgent today', 'low today', 'done today']);
    expect(g.carryOver.map((t) => t.title)).toEqual(['started']);
  });
});

describe('reports', () => {
  it('ranges and navigation', () => {
    expect(periodRange('week', '2026-11-22')).toEqual({ start: '2026-11-16', end: '2026-11-22' });
    expect(periodRange('month', '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(shiftPeriod('month', '2026-01-31', 1)).toBe('2026-02-01');
  });
  it('counts done tasks and hours per day and project in local time', () => {
    const a = task({ project: 'Client A', status: 'done', completedAt: iso('2026-11-21T21:00:00Z') }); // 22nd in Dubai
    const b = task({ project: '', status: 'done', completedAt: iso('2026-11-18T08:00:00Z') });
    const r = workReport(
      [a, b],
      [
        session({ taskId: a.clientId, startedAt: iso('2026-11-22T05:00:00Z'), endedAt: iso('2026-11-22T06:30:00Z') }),
        session({ taskId: b.clientId, startedAt: iso('2026-11-18T05:00:00Z'), endedAt: iso('2026-11-18T05:30:00Z') }),
        session({ taskId: a.clientId, startedAt: iso('2026-11-10T05:00:00Z'), endedAt: iso('2026-11-10T06:00:00Z') }), // outside
      ],
      '2026-11-16',
      '2026-11-22',
      DXB,
      new Date('2026-11-22T12:00:00Z'),
    );
    expect(r.totalDone).toBe(2);
    expect(r.totalSeconds).toBe(2 * 3600);
    expect(r.days.find((d) => d.date === '2026-11-22')).toEqual({ date: '2026-11-22', done: 1, seconds: 5400 });
    expect(r.projects).toEqual([
      { project: 'Client A', done: 1, seconds: 5400 },
      { project: 'No project', done: 1, seconds: 1800 },
    ]);
  });
  it('counts a running session up to now', () => {
    const t = task();
    const r = workReport([t], [session({ taskId: t.clientId, startedAt: iso('2026-11-22T10:00:00Z') })], '2026-11-22', '2026-11-22', DXB, new Date('2026-11-22T10:20:00Z'));
    expect(r.totalSeconds).toBe(1200);
  });
});

describe('task schema', () => {
  it('rejects a due time without a date and before-alarms without a time', () => {
    expect(taskSchema.safeParse({ ...task(), dueTime: '10:00' }).success).toBe(false);
    expect(
      taskSchema.safeParse({ ...task({ dueDate: '2026-11-22' }), alarms: [{ id: 'x', kind: 'before', minutesBefore: 5 }] }).success,
    ).toBe(false);
  });
});
