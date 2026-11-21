import { z } from 'zod';
import { isValidDate } from '../dates';

export const isoDateTime = z.iso.datetime();
export const dateStr = z.string().refine(isValidDate, 'Use YYYY-MM-DD');
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');

/** Fields every synced record carries (userId is added by the server). */
export const syncFields = {
  clientId: z.uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.nullable().default(null),
};

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;

export const recurrenceSchema = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1).max(365).default(1),
  /** weekly: 0=Sun … 6=Sat; empty = same weekday as the due date */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  /** monthly: day of month to keep (so 31st doesn't drift to 28th) */
  monthDay: z.number().int().min(1).max(31).nullable().default(null),
});

export const alarmSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(['at', 'before']),
    at: isoDateTime.nullable().default(null),
    minutesBefore: z.number().int().min(0).max(10080).nullable().default(null),
    style: z.enum(['reminder', 'alarm']).default('reminder'),
  })
  .refine((a) => (a.kind === 'at' ? a.at !== null : a.minutesBefore !== null), 'Alarm needs a time');

export const taskSchema = z
  .object({
    ...syncFields,
    title: z.string().trim().min(1, 'Give the task a title').max(200),
    notes: z.string().max(5000).default(''),
    project: z.string().trim().max(60).default(''),
    priority: z.enum(PRIORITIES).default('medium'),
    status: z.enum(STATUSES).default('todo'),
    dueDate: dateStr.nullable().default(null),
    dueTime: timeStr.nullable().default(null),
    estimateMin: z.number().int().min(1).max(10000).nullable().default(null),
    recurrence: recurrenceSchema.nullable().default(null),
    alarms: z.array(alarmSchema).max(10).default([]),
    completedAt: isoDateTime.nullable().default(null),
  })
  .refine((t) => !t.dueTime || t.dueDate, { message: 'Set a due date first', path: ['dueTime'] })
  .refine((t) => !t.recurrence || t.dueDate, { message: 'Repeating tasks need a due date', path: ['recurrence'] })
  .refine((t) => t.alarms.every((a) => a.kind === 'at' || (t.dueDate && t.dueTime)), {
    message: '"Before due" alarms need a due date and time',
    path: ['alarms'],
  });

export const timeSessionSchema = z
  .object({
    ...syncFields,
    taskId: z.uuid(),
    startedAt: isoDateTime,
    endedAt: isoDateTime.nullable().default(null),
  })
  .refine((s) => !s.endedAt || s.endedAt >= s.startedAt, { message: 'Ends before it starts', path: ['endedAt'] });

export const dailyLogSchema = z.object({
  ...syncFields,
  date: dateStr,
  done: z.string().max(5000).default(''),
  blockers: z.string().max(5000).default(''),
  tomorrow: z.string().max(5000).default(''),
});

export type Priority = (typeof PRIORITIES)[number];
export type TaskStatus = (typeof STATUSES)[number];
export type Recurrence = z.infer<typeof recurrenceSchema>;
export type Alarm = z.infer<typeof alarmSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TimeSession = z.infer<typeof timeSessionSchema>;
export type DailyLog = z.infer<typeof dailyLogSchema>;
