import { z } from 'zod';
import { dateStr, syncFields } from './work';

export const ATTENDANCE_STATUSES = ['present', 'off', 'absent', 'sick'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Hours are stored as integer minutes in 0.5 h (30 min) steps. */
const halfHours = (maxH: number, label: string) =>
  z
    .number()
    .int()
    .min(0, `${label} can't be negative`)
    .max(maxH * 60, `${label}: at most ${maxH} h`)
    .refine((m) => m % 30 === 0, `${label}: use 0.5 h steps`);

export const attendanceSchema = z
  .object({
    ...syncFields,
    date: dateStr,
    status: z.enum(ATTENDANCE_STATUSES),
    workMinutes: halfHours(24, 'Working hours').default(0),
    overtimeMinutes: halfHours(16, 'Overtime').default(0),
    note: z.string().trim().max(200, 'Keep the note under 200 characters').default(''),
  })
  .refine((a) => a.workMinutes + a.overtimeMinutes <= 24 * 60, {
    message: 'Working + overtime can be at most 24 h',
    path: ['overtimeMinutes'],
  })
  .refine((a) => a.status === 'present' || (a.workMinutes === 0 && a.overtimeMinutes === 0), {
    message: 'Only Present days have hours',
    path: ['workMinutes'],
  });

export type Attendance = z.infer<typeof attendanceSchema>;

/** Future days can only be planned as Off or Sick Leave. Returns an error message or null. */
export function attendanceDateError(date: string, status: AttendanceStatus, today: string): string | null {
  return date > today && (status === 'present' || status === 'absent') ? 'Future days can only be Off or Sick Leave' : null;
}
