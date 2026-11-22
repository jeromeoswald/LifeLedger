import { Router } from 'express';
import type { Model } from 'mongoose';
import type { z } from 'zod';
import { requireAuth } from '../lib/tokens';
import { HttpError } from '../lib/http';
import { applyChange, softDelete } from '../lib/syncStore';

/** Mongo doc -> API shape: no _id/userId, Dates as ISO strings. */
export function toDto(doc: Record<string, unknown>) {
  const { _id, userId, syncedAt, ...rest } = doc;
  void syncedAt;
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

  // Full list (REST); devices use POST /sync for incremental changes.
  r.get('/', async (_req, res) => {
    const docs = await model.find({ userId: res.locals.userId, deletedAt: null }).sort({ createdAt: 1 }).lean();
    res.json({ items: docs.map(toDto) });
  });

  r.put('/:clientId', async (req, res) => {
    const input = schema.parse({ ...req.body, clientId: req.params.clientId });
    const { doc, stale, created } = await applyChange(model, res.locals.userId, { clientId: input.clientId }, input);
    if (stale) res.json({ item: toDto(doc), stale: true }); // a newer edit already won
    else res.status(created ? 201 : 200).json({ item: toDto(doc) });
  });

  r.delete('/:clientId', async (req, res) => {
    if (!(await softDelete(model, res.locals.userId, { clientId: req.params.clientId }))) throw new HttpError(404, 'Not found');
    res.status(204).end();
  });

  return r;
}
