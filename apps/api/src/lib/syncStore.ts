import type { Model } from 'mongoose';
import { HttpError } from './http';

export type Doc = Record<string, unknown>;

/**
 * The one write path for synced records (REST routes and POST /sync).
 * - Latest `updatedAt` wins: an older incoming edit is ignored and the stored record returned.
 * - `syncedAt` is the SERVER time of the write; "changes since" queries use it, never client clocks
 *   (an edit made offline yesterday and uploaded today must still reach other devices).
 * - `key` finds the record (clientId, or date for attendance); an existing clientId is kept.
 */
export async function applyChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>,
  userId: unknown,
  key: Doc,
  input: Doc & { clientId: string; updatedAt: string },
): Promise<{ doc: Doc; stale: boolean; created: boolean }> {
  const existing = await model.findOne({ userId, ...key }).lean<Doc>();
  if (existing && (existing.updatedAt as Date).getTime() > Date.parse(input.updatedAt)) {
    return { doc: existing, stale: true, created: false };
  }
  try {
    const doc = await model
      .findOneAndUpdate(
        { userId, ...key },
        { ...input, clientId: (existing?.clientId as string | undefined) ?? input.clientId, userId, syncedAt: new Date() },
        { upsert: true, new: true },
      )
      .lean<Doc>();
    return { doc: doc!, stale: false, created: !existing };
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new HttpError(409, 'Conflict, retry');
    throw e;
  }
}

/** Soft delete through the same path, so other devices see the tombstone. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function softDelete(model: Model<any>, userId: unknown, key: Doc) {
  const now = new Date();
  return model.findOneAndUpdate({ userId, ...key, deletedAt: null }, { deletedAt: now, updatedAt: now, syncedAt: now });
}
