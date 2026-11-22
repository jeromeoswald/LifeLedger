import { describe, expect, it } from 'vitest';
import { attendanceBuckets, attendanceCsv, attendanceRows, attendanceSummary, formatHours, weekRange } from './attendance';
import { periodRange } from './work';
import { attendanceDateError, attendanceSchema, type Attendance } from './schemas/attendance';

const T0 = '2026-11-01T00:00:00.000Z';
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const a = (date: string, status: Attendance['status'], work = 0, ot = 0, p: Partial<Attendance> = {}): Attendance =>
  attendanceSchema.parse({ clientId: uuid(), createdAt: T0, updatedAt: T0, date, status, workMinutes: work, overtimeMinutes: ot, ...p });

describe('attendance validation', () => {
  const base = { clientId: uuid(), createdAt: T0, updatedAt: T0, date: '2026-11-20' };
  const ok = (p: object) => attendanceSchema.safeParse({ ...base, ...p }).success;

  it('hours 0–24, OT 0–16, total ≤ 24, 0.5 h steps', () => {
    expect(ok({ status: 'present', workMinutes: 480 })).toBe(true);
    expect(ok({ status: 'present', workMinutes: 1440 })).toBe(true);
    expect(ok({ status: 'present', workMinutes: 1470 })).toBe(false); // 24.5 h
    expect(ok({ status: 'present', workMinutes: -30 })).toBe(false);
    expect(ok({ status: 'present', workMinutes: 0, overtimeMinutes: 960 })).toBe(true);
    expect(ok({ status: 'present', workMinutes: 0, overtimeMinutes: 990 })).toBe(false); // OT 16.5 h
    expect(ok({ status: 'present', workMinutes: 1200, overtimeMinutes: 360 })).toBe(false); // 20 + 6 > 24
    expect(ok({ status: 'present', workMinutes: 1080, overtimeMinutes: 360 })).toBe(true); // 18 + 6 = 24
    expect(ok({ status: 'present', workMinutes: 495 })).toBe(false); // 8.25 h is not a 0.5 step
    expect(ok({ status: 'present', workMinutes: 510 })).toBe(true); // 8.5 h
  });

  it('only Present days carry hours', () => {
    expect(ok({ status: 'off' })).toBe(true);
    expect(ok({ status: 'sick', workMinutes: 480 })).toBe(false);
    expect(ok({ status: 'absent', overtimeMinutes: 60 })).toBe(false);
  });

  it('future dates allow only Off and Sick Leave', () => {
    const today = '2026-11-22';
    expect(attendanceDateError('2026-11-23', 'off', today)).toBeNull();
    expect(attendanceDateError('2026-11-23', 'sick', today)).toBeNull();
    expect(attendanceDateError('2026-11-23', 'present', today)).toMatch(/Off or Sick/);
    expect(attendanceDateError('2026-11-23', 'absent', today)).toMatch(/Off or Sick/);
    expect(attendanceDateError('2026-11-22', 'present', today)).toBeNull(); // today is fine
    expect(attendanceDateError('2026-01-01', 'absent', today)).toBeNull(); // past is fine
  });
});

describe('attendance summary', () => {
  // Mon 16 – Sun 22 Nov 2026
  const week = [
    a('2026-11-16', 'present', 480, 120), // 8+2
    a('2026-11-17', 'present', 570), // 9.5
    a('2026-11-18', 'sick'),
    a('2026-11-19', 'present', 480),
    a('2026-11-20', 'absent'),
    a('2026-11-21', 'off'),
    // 22nd (today) not marked
  ];

  it('counts, totals, man-hours and average per Present day', () => {
    expect(attendanceSummary(week, '2026-11-16', '2026-11-22', '2026-11-22')).toEqual({
      present: 3,
      off: 1,
      absent: 1,
      sick: 1,
      notMarked: 1,
      workMinutes: 480 + 570 + 480,
      overtimeMinutes: 120,
      manMinutes: 1530 + 120,
      avgWorkMinutes: 510, // 1530 / 3 = 8.5 h
    });
  });

  it('future days are not counted as "not marked"', () => {
    expect(attendanceSummary(week, '2026-11-16', '2026-11-30', '2026-11-22').notMarked).toBe(1);
  });

  it('no Present days → average 0, not NaN', () => {
    expect(attendanceSummary([a('2026-11-21', 'off')], '2026-11-21', '2026-11-21', '2026-11-22').avgWorkMinutes).toBe(0);
  });

  it('latest edit of the same date wins', () => {
    const older = a('2026-11-16', 'present', 480, 0, { updatedAt: '2026-11-16T08:00:00.000Z' });
    const newer = a('2026-11-16', 'off', 0, 0, { updatedAt: '2026-11-16T09:00:00.000Z' });
    expect(attendanceSummary([older, newer], '2026-11-16', '2026-11-16', '2026-11-22')).toMatchObject({ present: 0, off: 1, workMinutes: 0 });
  });

  it('Monday vs Sunday week start', () => {
    expect(weekRange('2026-11-22', 1)).toEqual({ start: '2026-11-16', end: '2026-11-22' }); // Sunday ends a Mon week
    expect(weekRange('2026-11-22', 0)).toEqual({ start: '2026-11-22', end: '2026-11-28' }); // …and starts a Sun week
    expect(weekRange('2026-11-18', 0)).toEqual({ start: '2026-11-15', end: '2026-11-21' });
  });

  it('month boundaries (incl. leap February) and per-week buckets', () => {
    expect(periodRange('month', '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    const r = periodRange('month', '2026-11-05');
    const buckets = attendanceBuckets(week, r.start, r.end, 'week', 1);
    expect(buckets[0]).toEqual({ key: '2026-10-26', work: 0, ot: 0 }); // 1 Nov is a Sunday: its Monday-week starts in October
    expect(buckets.find((b) => b.key === '2026-11-16')).toEqual({ key: '2026-11-16', work: 1530, ot: 120 });
    expect(attendanceSummary(week, '2026-11-01', '2026-11-15', '2026-11-22').present).toBe(0); // entries outside the range are ignored
  });
});

describe('attendance export', () => {
  it('rows include unmarked days, hours as numbers, and the CSV is formula-safe', () => {
    const rows = attendanceRows([a('2026-11-16', 'present', 510, 60, { note: '=cmd' })], '2026-11-16', '2026-11-17');
    expect(rows).toEqual([
      { date: '2026-11-16', day: 'Mon', status: 'Present', work: 8.5, ot: 1, total: 9.5, note: '=cmd' },
      { date: '2026-11-17', day: 'Tue', status: 'Not marked', work: 0, ot: 0, total: 0, note: '' },
    ]);
    const csv = attendanceCsv([a('2026-11-16', 'present', 510, 60, { note: '=cmd' })], '2026-11-16', '2026-11-16');
    expect(csv).toBe("﻿Date,Day,Status,Working h,OT h,Total h,Note\r\n2026-11-16,Mon,Present,8.5,1,9.5,'=cmd\r\n");
    expect(formatHours(570)).toBe('9.5');
  });
});
