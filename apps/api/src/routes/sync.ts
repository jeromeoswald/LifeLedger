import { Router } from 'express';
import { z } from 'zod';
import type { Model } from 'mongoose';
import {
  accountSchema,
  attendanceDateError,
  attendanceSchema,
  categorySchema,
  dailyLogSchema,
  habitEntrySchema,
  habitSchema,
  isoDateTime,
  localDate,
  recurringSchema,
  taskSchema,
  timeSessionSchema,
  transactionSchema,
  updateMeSchema,
} from '@lifeledger/shared';
import { requireAuth } from '../lib/tokens';
import { HttpError } from '../lib/http';
import { applyChange, type Doc } from '../lib/syncStore';
import { UserModel, toUserDto } from '../models/User';
import {
  AccountModel,
  AttendanceModel,
  CategoryModel,
  DailyLogModel,
  HabitEntryModel,
  HabitModel,
  RecurringModel,
  TaskModel,
  TimeSessionModel,
  TransactionModel,
} from '../models/synced';
import { toDto } from './synced';

type Entry = { model: Model<any>; schema: z.ZodType<Doc & { clientId: string; updatedAt: string }>; key: 'clientId' | 'date' }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Everything a device keeps offline. Attendance is keyed by date (one entry per day). */
export const SYNCED: Record<string, Entry> = {
  tasks: { model: TaskModel, schema: taskSchema, key: 'clientId' },
  'time-sessions': { model: TimeSessionModel, schema: timeSessionSchema, key: 'clientId' },
  'daily-logs': { model: DailyLogModel, schema: dailyLogSchema, key: 'clientId' },
  habits: { model: HabitModel, schema: habitSchema, key: 'clientId' },
  'habit-entries': { model: HabitEntryModel, schema: habitEntrySchema, key: 'clientId' },
  accounts: { model: AccountModel, schema: accountSchema, key: 'clientId' },
  categories: { model: CategoryModel, schema: categorySchema, key: 'clientId' },
  transactions: { model: TransactionModel, schema: transactionSchema, key: 'clientId' },
  recurring: { model: RecurringModel, schema: recurringSchema, key: 'clientId' },
  attendance: { model: AttendanceModel, schema: attendanceSchema as Entry['schema'], key: 'date' },
};
const NAMES = Object.keys(SYNCED) as [string, ...string[]];

const MAX_PUSH = 1000;
/** Pull window overlap: a write committed while we were reading is picked up next time (duplicates are harmless). */
const OVERLAP_MS = 5000;

const body = z.object({
  lastSyncedAt: isoDateTime.nullable(),
  changes: z.partialRecord(z.enum(NAMES), z.array(z.record(z.string(), z.unknown()))).default({}),
  /** settings edited offline: applied if newer than the stored ones */
  settings: z.object({ updatedAt: isoDateTime, patch: updateMeSchema }).nullable().default(null),
});

export const syncRouter = Router();
syncRouter.use(requireAuth);

/**
 * Push queued changes, then pull everything written since `lastSyncedAt` (by server time).
 * Conflicts: the latest updatedAt wins (applyChange). Deletes travel as records with deletedAt.
 */
syncRouter.post('/', async (req, res) => {
  const input = body.parse(req.body);
  const userId = res.locals.userId;
  const user = await UserModel.findOne({ _id: userId, deletedAt: null });
  if (!user) throw new HttpError(401, 'Not signed in');

  const pushed = Object.values(input.changes).reduce((n, l) => n + (l?.length ?? 0), 0);
  if (pushed > MAX_PUSH) throw new HttpError(413, `Send at most ${MAX_PUSH} changes per sync`);

  const today = localDate(new Date(), user.timeZone);
  // a rejected change comes back with the server's current copy (or null), so the device can revert to it
  const rejected: { collection: string; key: string; error: string; current: Doc | null }[] = [];
  let applied = 0;
  for (const [name, list] of Object.entries(input.changes)) {
    const { model, schema, key } = SYNCED[name]!;
    const reject = async (k: string, error: string) => {
      const cur = await model.findOne({ userId, [key]: k }).lean<Doc>();
      rejected.push({ collection: name, key: k, error, current: cur ? toDto(cur) : null });
    };
    for (const raw of list ?? []) {
      const parsed = schema.safeParse(raw);
      const k = String(raw[key] ?? raw.clientId ?? '?');
      if (!parsed.success) {
        await reject(k, parsed.error.issues[0]?.message ?? 'Invalid');
        continue;
      }
      const rec = parsed.data;
      if (name === 'attendance' && !rec.deletedAt) {
        const err = attendanceDateError(rec.date as string, rec.status as 'present', today);
        if (err) {
          await reject(k, err);
          continue;
        }
      }
      await applyChange(model, userId, { [key]: rec[key] }, rec);
      applied++;
    }
  }

  // settings: latest edit wins, like records
  if (input.settings && (!user.settingsUpdatedAt || Date.parse(input.settings.updatedAt) > user.settingsUpdatedAt.getTime())) {
    user.set({ ...input.settings.patch, settingsUpdatedAt: new Date(input.settings.updatedAt) });
    await user.save();
  }

  const pullStart = new Date();
  const since = input.lastSyncedAt ? { syncedAt: { $gt: new Date(input.lastSyncedAt) } } : { deletedAt: null }; // first sync: live records only
  const changes: Record<string, Doc[]> = {};
  for (const [name, { model }] of Object.entries(SYNCED)) {
    const docs = await model.find({ userId, ...since }).lean<Doc[]>();
    if (docs.length) changes[name] = docs.map(toDto);
  }

  res.json({
    serverTime: new Date(pullStart.getTime() - OVERLAP_MS).toISOString(),
    applied,
    rejected,
    changes,
    user: toUserDto(user),
  });
});
