import { Router } from 'express';
import type { Model } from 'mongoose';
import type { z } from 'zod';
import { requireAuth } from '../lib/tokens';
import { HttpError } from '../lib/http';

/** Mongo doc -> API shape: no _id/userId, Dates as ISO strings. */
export function toDto(doc: Record<string, unknown>) {
  const { _id, userId, ...rest } = doc;
  void _id;
  void userId;
  for (const [k, v] of Object.entries(rest)) if (v instanceof Date) rest[k] = v.toISOString();
  return rest;
}

/**
 * CRUD for a synced collection, keyed by the client's UUID:
 *   GET    /            live records of the signed-in user
 *   PUT    /:clientId   create or update; an older updatedAt than the stored one is ignored
 *   DELETE /:clientId   soft delete (deletedAt), so other devices learn about it
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function syncedRouter(model: Model<any>, schema: z.ZodType<{ clientId: string; updatedAt: string }>) {
  const r = Router();
  r.use(requireAuth);

  // shortcut: returns every live record; Phase 6 sync adds "changes since lastSyncedAt".
  r.get('/', async (_req, res) => {
    const docs = await model.find({ userId: res.locals.userId, deletedAt: null }).sort({ createdAt: 1 }).lean();
    res.json({ items: docs.map(toDto) });
  });

  r.put('/:clientId', async (req, res) => {
    const input = schema.parse({ ...req.body, clientId: req.params.clientId });
    const userId = res.locals.userId;
    const existing = await model.findOne({ userId, clientId: input.clientId }).lean<Record<string, unknown>>();
    if (existing && (existing.updatedAt as Date).getTime() > Date.parse(input.updatedAt)) {
      res.json({ item: toDto(existing), stale: true }); // a newer edit already won
      return;
    }
    try {
      const doc = await model
        .findOneAndUpdate({ userId, clientId: input.clientId }, { ...input, userId }, { upsert: true, new: true })
        .lean<Record<string, unknown>>();
      res.status(existing ? 200 : 201).json({ item: toDto(doc!) });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw new HttpError(409, 'Conflict, retry');
      throw e;
    }
  });

  r.delete('/:clientId', async (req, res) => {
    const now = new Date();
    const doc = await model.findOneAndUpdate(
      { userId: res.locals.userId, clientId: req.params.clientId },
      { deletedAt: now, updatedAt: now },
    );
    if (!doc) throw new HttpError(404, 'Not found');
    res.status(204).end();
  });

  return r;
}
