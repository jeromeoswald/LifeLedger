import { z } from 'zod';
import { dateStr, isoDateTime, syncFields, timeStr } from './work';

export const HABIT_TYPES = ['yesno', 'count', 'duration'] as const;

export const habitScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }),
  /** 0=Sun … 6=Sat */
  z.object({ kind: z.literal('weekdays'), days: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one day').max(7) }),
  z.object({ kind: z.literal('perWeek'), times: z.number().int().min(1).max(7) }),
]);

export const habitSchema = z
  .object({
    ...syncFields,
    name: z.string().trim().min(1, 'Give the habit a name').max(80),
    type: z.enum(HABIT_TYPES),
    /** yesno: 1; count: how many; duration: minutes */
    target: z.number().int().min(1, 'Target must be at least 1').max(10000).default(1),
    unit: z.string().trim().max(20).default(''),
    schedule: habitScheduleSchema,
    reminderTime: timeStr.nullable().default(null),
    /** first local day the habit counts from */
    startDate: dateStr,
    archivedAt: isoDateTime.nullable().default(null),
  })
  .refine((h) => h.type !== 'yesno' || h.target === 1, { message: 'Yes/no habits have a target of 1', path: ['target'] });

export const habitEntrySchema = z.object({
  ...syncFields,
  habitId: z.uuid(),
  /** local date in the user's time zone */
  date: dateStr,
  /** yesno: 0/1; count: number; duration: minutes. 0 = not done */
  value: z.number().int().min(0).max(100000),
  /** optional note for the day, e.g. "Pages 45–72" */
  note: z.string().trim().max(500, 'Keep notes under 500 characters').default(''),
});

export type HabitType = (typeof HABIT_TYPES)[number];
export type HabitSchedule = z.infer<typeof habitScheduleSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type HabitEntry = z.infer<typeof habitEntrySchema>;
