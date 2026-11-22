import { addDays, dateRange, startOfWeek, weekday } from './dates';
import { csvCell } from './wallet';
import type { Attendance, AttendanceStatus } from './schemas/attendance';

export const STATUS_LABEL: Record<AttendanceStatus, string> = { present: 'Present', off: 'Off', absent: 'Absent', sick: 'Sick Leave' };

/** Minutes → hours as a short string: 480 → "8", 570 → "9.5". */
export const formatHours = (minutes: number) => String(minutes / 60);

export function weekRange(date: string, weekStart: 0 | 1 = 1) {
  const start = startOfWeek(date, weekStart);
  return { start, end: addDays(start, 6) };
}

/** date -> live entry (latest edit wins if two devices wrote the same date). */
export function attendanceByDate(entries: Attendance[]): Map<string, Attendance> {
  const out = new Map<string, Attendance>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    const prev = out.get(e.date);
    if (!prev || e.updatedAt > prev.updatedAt) out.set(e.date, e);
  }
  return out;
}

export interface AttendanceSummary {
  present: number;
  off: number;
  absent: number;
  sick: number;
  /** days up to today in the range with no entry (future days are not "missed") */
  notMarked: number;
  workMinutes: number;
  overtimeMinutes: number;
  /** working + overtime */
  manMinutes: number;
  /** average working minutes per Present day (0 if none) */
  avgWorkMinutes: number;
}

export function attendanceSummary(entries: Attendance[], start: string, end: string, today: string): AttendanceSummary {
  const byDate = attendanceByDate(entries);
  const s: AttendanceSummary = { present: 0, off: 0, absent: 0, sick: 0, notMarked: 0, workMinutes: 0, overtimeMinutes: 0, manMinutes: 0, avgWorkMinutes: 0 };
  for (const d of dateRange(start, end)) {
    const e = byDate.get(d);
    if (!e) {
      if (d <= today) s.notMarked++;
      continue;
    }
    s[e.status]++;
    if (e.status === 'present') {
      s.workMinutes += e.workMinutes;
      s.overtimeMinutes += e.overtimeMinutes;
    }
  }
  s.manMinutes = s.workMinutes + s.overtimeMinutes;
  s.avgWorkMinutes = s.present ? Math.round(s.workMinutes / s.present) : 0;
  return s;
}

/** Chart buckets: one per day, or one per week (by weekStart) for longer ranges. */
export function attendanceBuckets(entries: Attendance[], start: string, end: string, by: 'day' | 'week', weekStart: 0 | 1 = 1) {
  const byDate = attendanceByDate(entries);
  const buckets = new Map<string, { key: string; work: number; ot: number }>();
  for (const d of dateRange(start, end)) {
    const key = by === 'day' ? d : startOfWeek(d, weekStart);
    const b = buckets.get(key) ?? { key, work: 0, ot: 0 };
    const e = byDate.get(d);
    if (e?.status === 'present') {
      b.work += e.workMinutes;
      b.ot += e.overtimeMinutes;
    }
    buckets.set(key, b);
  }
  return [...buckets.values()];
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Export rows for a range: Date, Day, Status, Working h, OT h, Total h, Note (unmarked days included). */
export function attendanceRows(entries: Attendance[], start: string, end: string) {
  const byDate = attendanceByDate(entries);
  return dateRange(start, end).map((d) => {
    const e = byDate.get(d);
    const work = e?.status === 'present' ? e.workMinutes / 60 : 0;
    const ot = e?.status === 'present' ? e.overtimeMinutes / 60 : 0;
    return { date: d, day: DAY[weekday(d)]!, status: e ? STATUS_LABEL[e.status] : 'Not marked', work, ot, total: work + ot, note: e?.note ?? '' };
  });
}

export const ATTENDANCE_EXPORT_HEADER = ['Date', 'Day', 'Status', 'Working h', 'OT h', 'Total h', 'Note'];

export function attendanceCsv(entries: Attendance[], start: string, end: string): string {
  const lines = attendanceRows(entries, start, end).map((r) =>
    [csvCell(r.date), csvCell(r.day), csvCell(r.status), csvCell(r.work), csvCell(r.ot), csvCell(r.total), csvCell(r.note, true)].join(','),
  );
  return '﻿' + [ATTENDANCE_EXPORT_HEADER.join(','), ...lines].join('\r\n') + '\r\n';
}
