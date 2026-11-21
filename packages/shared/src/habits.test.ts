import { describe, expect, it } from 'vitest';
import { dateRange } from './dates';
import { describeSchedule, habitNotes, habitStats, habitValues, heatmapWeeks } from './habits';
import { habitEntrySchema, habitSchema, type Habit, type HabitEntry } from './schemas/habits';

const DXB = 'Asia/Dubai';
const T0 = '2026-01-01T00:00:00.000Z';
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function habit(p: Partial<Habit> = {}): Habit {
  return habitSchema.parse({ clientId: uuid(), createdAt: T0, updatedAt: T0, name: 'H', type: 'yesno', schedule: { kind: 'daily' }, startDate: '2026-01-01', ...p });
}
const entry = (h: Habit, date: string, value = 1, updatedAt = T0): HabitEntry => ({
  clientId: uuid(), createdAt: T0, updatedAt, deletedAt: null, habitId: h.clientId, date, value, note: '',
});
const days = (h: Habit, from: string, to: string, value = 1) => dateRange(from, to).map((d) => entry(h, d, value));
/** noon in Dubai on a local date */
const at = (date: string) => new Date(`${date}T08:00:00Z`);

describe('daily streaks', () => {
  const h = habit({ startDate: '2026-01-20' });

  it('runs across a month boundary', () => {
    const s = habitStats(h, days(h, '2026-01-28', '2026-02-02'), at('2026-02-02'), DXB);
    expect(s).toMatchObject({ current: 6, best: 6, doneToday: true, unit: 'days' });
  });

  it('runs across a year boundary', () => {
    const y = habit({ startDate: '2026-12-01' });
    expect(habitStats(y, days(y, '2026-12-29', '2027-01-03'), at('2027-01-03'), DXB).current).toBe(6);
  });

  it('a pending today does not break the streak', () => {
    const s = habitStats(h, days(h, '2026-01-28', '2026-02-01'), at('2026-02-02'), DXB);
    expect(s).toMatchObject({ current: 5, doneToday: false, dueToday: true });
  });

  it('a missed yesterday resets current but keeps best', () => {
    const s = habitStats(h, [...days(h, '2026-01-20', '2026-01-26'), ...days(h, '2026-01-30', '2026-01-31')], at('2026-02-02'), DXB);
    expect(s.current).toBe(0);
    expect(s.best).toBe(7);
  });

  it('count habits need the target to count as done', () => {
    const c = habit({ type: 'count', target: 8, startDate: '2026-01-30' });
    const s = habitStats(c, [entry(c, '2026-01-30', 8), entry(c, '2026-01-31', 9), entry(c, '2026-02-01', 5)], at('2026-02-01'), DXB);
    expect(s).toMatchObject({ current: 2, doneToday: false, valueToday: 5 });
  });
});

describe('time zones', () => {
  const h = habit({ startDate: '2026-11-01' });
  const entries = [entry(h, '2026-11-21'), entry(h, '2026-11-22')];
  const now = new Date('2026-11-21T21:30:00Z'); // 01:30 on the 22nd in Dubai, still the 21st in UTC

  it('uses the user time zone for "today"', () => {
    expect(habitStats(h, entries, now, DXB)).toMatchObject({ today: '2026-11-22', current: 2, doneToday: true });
    expect(habitStats(h, entries, now, 'UTC')).toMatchObject({ today: '2026-11-21', current: 1, doneToday: true });
  });

  it('an evening check-in in Dubai lands on the local day, not the UTC day', () => {
    const lateNight = new Date('2026-11-22T19:59:00Z'); // 23:59 on the 22nd in Dubai
    expect(habitStats(h, entries, lateNight, DXB).doneToday).toBe(true);
    const afterMidnight = new Date('2026-11-22T20:01:00Z'); // 00:01 on the 23rd in Dubai
    expect(habitStats(h, entries, afterMidnight, DXB)).toMatchObject({ today: '2026-11-23', doneToday: false, current: 2 });
  });
});

describe('weekday schedules', () => {
  it('only scheduled days count; off days never break a streak', () => {
    const h = habit({ schedule: { kind: 'weekdays', days: [1, 3, 5] }, startDate: '2026-11-02' }); // Mon/Wed/Fri
    // Mon 16, Wed 18, Fri 20 done; weekend and Tue/Thu skipped; today Sun 22
    const s = habitStats(h, [entry(h, '2026-11-16'), entry(h, '2026-11-18'), entry(h, '2026-11-20')], at('2026-11-22'), DXB);
    expect(s).toMatchObject({ current: 3, dueToday: false });
    expect(describeSchedule(h.schedule)).toBe('Mon, Wed, Fri');
    expect(describeSchedule({ kind: 'weekdays', days: [5, 4, 3, 2, 1] })).toBe('Weekdays');
  });
});

describe('X per week', () => {
  const h = habit({ schedule: { kind: 'perWeek', times: 3 }, startDate: '2026-11-02' });
  // weeks start Mon: 2 Nov (3 done), 9 Nov (3 done), 16 Nov (2 done), 23 Nov running
  const e = [
    ...['2026-11-02', '2026-11-04', '2026-11-06'],
    ...['2026-11-10', '2026-11-12', '2026-11-14'],
    ...['2026-11-17', '2026-11-19'],
  ].map((d) => entry(h, d));

  it('counts whole weeks and does not let the running week break it', () => {
    // Sunday 22nd is the last day of the running week: 2 of 3 so far, so it's pending, not broken
    expect(habitStats(h, e, at('2026-11-22'), DXB)).toMatchObject({ unit: 'weeks', current: 2, best: 2, thisWeek: 2, dueToday: true });
    // once that week is over without hitting 3, the streak resets
    expect(habitStats(h, e, at('2026-11-24'), DXB)).toMatchObject({ current: 0, best: 2, thisWeek: 0 });
    const met = [...e, entry(h, '2026-11-21')];
    expect(habitStats(h, met, at('2026-11-22'), DXB)).toMatchObject({ current: 3, best: 3, thisWeek: 3, dueToday: false });
    expect(habitStats(h, met, at('2026-11-24'), DXB)).toMatchObject({ current: 3, thisWeek: 0 }); // new week pending
  });
});

describe('completion and data', () => {
  it('rate over the last 30 days ignores a pending today', () => {
    const h = habit({ startDate: '2026-11-13' }); // 10 days incl. today the 22nd
    const s = habitStats(h, days(h, '2026-11-13', '2026-11-20'), at('2026-11-22'), DXB);
    expect(s.rate30).toBeCloseTo(8 / 9); // 21st missed, 22nd pending
  });

  it('back-filled days before the start date count', () => {
    const h = habit({ startDate: '2026-11-22' });
    expect(habitStats(h, days(h, '2026-11-19', '2026-11-22'), at('2026-11-22'), DXB).current).toBe(4);
  });

  it('two devices editing the same day: latest edit wins', () => {
    const h = habit();
    const v = habitValues([entry(h, '2026-11-22', 1, '2026-11-22T10:00:00Z'), entry(h, '2026-11-22', 0, '2026-11-22T11:00:00Z')], h.clientId);
    expect(v.get('2026-11-22')).toBe(0);
  });

  it('lists day notes newest first, using the latest edit of each day', () => {
    const h = habit();
    const notes = habitNotes(
      [
        { ...entry(h, '2026-11-20', 1), note: 'Pages 1–30' },
        { ...entry(h, '2026-11-22', 1, '2026-11-22T10:00:00Z'), note: 'old' },
        { ...entry(h, '2026-11-22', 1, '2026-11-22T11:00:00Z'), note: 'Pages 31–58' },
        entry(h, '2026-11-21', 1), // no note
      ],
      h.clientId,
    );
    expect(notes).toEqual([
      { date: '2026-11-22', note: 'Pages 31–58' },
      { date: '2026-11-20', note: 'Pages 1–30' },
    ]);
    expect(habitEntrySchema.parse({ ...entry(h, '2026-11-22'), note: undefined }).note).toBe('');
  });

  it('heatmap is Monday-start weeks ending this week', () => {
    const w = heatmapWeeks('2026-11-22', 3);
    expect(w.map((x) => x[0])).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(w[2]![6]).toBe('2026-11-22');
  });

  it('validates habits', () => {
    expect(habitSchema.safeParse({ ...habit(), target: 3 }).success).toBe(false); // yes/no target must be 1
    expect(habitSchema.safeParse({ ...habit(), schedule: { kind: 'weekdays', days: [] } }).success).toBe(false);
  });
});
