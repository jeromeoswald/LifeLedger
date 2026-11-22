import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  attendanceDateError,
  attendanceSchema,
  attendanceSummary,
  dateStr,
  daysBetween,
  localDate,
  periodRange,
  weekRange,
  type Attendance,
} from '@lifeledger/shared';
import { requireAuth } from '../lib/tokens';
import { HttpError } from '../lib/http';
import { UserModel } from '../models/User';
import { AttendanceModel } from '../models/synced';
import { toDto } from './synced';
import { applyChange, softDelete } from '../lib/syncStore';

const MAX_RANGE_DAYS = 400;

/** The signed-in user's time zone and week start (for "today" and week ranges). */
async function prefs(res: Response) {
  const u = await UserModel.findOne({ _id: res.locals.userId, deletedAt: null }).lean();
  if (!u) throw new HttpError(401, 'Not signed in');
  return { tz: u.timeZone ?? 'Asia/Dubai', weekStart: (u.weekStart === 0 ? 0 : 1) as 0 | 1 };
}

export async function entriesBetween(userId: unknown, from: string, to: string) {
  const docs = await AttendanceModel.find({ userId, deletedAt: null, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean();
  return docs.map((d) => toDto(d as Record<string, unknown>)) as unknown as Attendance[];
}

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);

attendanceRouter.get('/', async (req, res) => {
  const q = z.object({ from: dateStr, to: dateStr }).parse(req.query);
  if (q.from > q.to || daysBetween(q.from, q.to) > MAX_RANGE_DAYS) throw new HttpError(400, `from must be before to, at most ${MAX_RANGE_DAYS} days`);
  res.json({ items: await entriesBetween(res.locals.userId, q.from, q.to) });
});

attendanceRouter.get('/summary', async (req, res) => {
  const q = z.object({ period: z.enum(['week', 'month']), date: dateStr }).parse(req.query);
  const { tz, weekStart } = await prefs(res);
  const { start, end } = q.period === 'week' ? weekRange(q.date, weekStart) : periodRange('month', q.date);
  const entries = await entriesBetween(res.locals.userId, start, end);
  res.json({ period: q.period, start, end, weekStart, ...attendanceSummary(entries, start, end, localDate(new Date(), tz)) });
});

/** Idempotent upsert keyed by date (auto-save sends the full entry every time). */
attendanceRouter.put('/:date', async (req, res) => {
  const input = attendanceSchema.parse({ ...req.body, date: req.params.date });
  const userId = res.locals.userId;
  const { tz } = await prefs(res);
  const dateErr = attendanceDateError(input.date, input.status, localDate(new Date(), tz));
  if (dateErr) throw new HttpError(400, dateErr);

  // keyed by date: the day keeps its first clientId, and a PUT revives a soft-deleted day (deletedAt: null)
  const { doc, stale, created } = await applyChange(AttendanceModel, userId, { date: input.date }, input);
  if (stale) res.json({ item: toDto(doc), stale: true }); // a newer edit already won
  else res.status(created ? 201 : 200).json({ item: toDto(doc) });
});

attendanceRouter.delete('/:date', async (req, res) => {
  const date = dateStr.parse(req.params.date);
  if (!(await softDelete(AttendanceModel, res.locals.userId, { date }))) throw new HttpError(404, 'Not found');
  res.status(204).end();
});
