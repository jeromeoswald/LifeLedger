import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { addDays, localDate } from '@lifeledger/shared';
import { connectDb } from '../src/db';
import { createApp } from '../src/app';
import { UserModel } from '../src/models/User';
import { SessionModel } from '../src/models/Session';
import { AttendanceModel, TaskModel } from '../src/models/synced';

const app = createApp();
let auth = '';
const iso = (msFromNow = 0) => new Date(Date.now() + msFromNow).toISOString();
const task = (p: Record<string, unknown> = {}) => ({ clientId: randomUUID(), createdAt: iso(), updatedAt: iso(), deletedAt: null, title: 'Buy milk', ...p });

/** One device: keeps its own lastSyncedAt cursor, like the app does. */
function device(token = () => auth) {
  let cursor: string | null = null;
  return async (changes: Record<string, unknown[]> = {}, settings: unknown = null) => {
    const r = await request(app).post('/api/v1/sync').set('Authorization', token()).send({ lastSyncedAt: cursor, changes, settings });
    expect(r.status).toBe(200);
    cursor = r.body.serverTime;
    return r.body as { changes: Record<string, Record<string, unknown>[]>; rejected: { collection: string; key: string; error: string }[]; applied: number; user: Record<string, unknown> };
  };
}

beforeAll(async () => {
  await connectDb();
  await Promise.all([UserModel.init(), SessionModel.init(), TaskModel.init(), AttendanceModel.init()]);
});
beforeEach(async () => {
  await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({}), TaskModel.deleteMany({}), AttendanceModel.deleteMany({})]);
  const r = await request(app).post('/api/v1/auth/register').set('X-Client', 'native').send({ email: 'jerome@example.com', password: 'password-123' });
  auth = `Bearer ${r.body.accessToken as string}`;
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('POST /sync', () => {
  it('offline create on one device appears on the other after it reconnects', async () => {
    const phone = device();
    const laptop = device();
    await phone();
    await laptop();
    // phone was offline when this was created (an hour ago), and syncs now
    const t = task({ createdAt: iso(-3_600_000), updatedAt: iso(-3_600_000) });
    expect((await phone({ tasks: [t] })).applied).toBe(1);
    // the laptop synced in between, yet still gets it: pulls use the SERVER write time, not the old client time
    const got = await laptop();
    expect(got.changes.tasks?.map((x) => x.clientId)).toContain(t.clientId);
  });

  it('two devices edit the same record: the latest updatedAt wins, in either arrival order', async () => {
    const a = device();
    const b = device();
    const t = task();
    await a({ tasks: [t] });
    await b();
    const newer = { ...t, title: 'Newer (from B)', updatedAt: iso(2000) };
    const older = { ...t, title: 'Older (from A)', updatedAt: iso(1000) };
    await b({ tasks: [newer] }); // newer arrives first
    await a({ tasks: [older] }); // older arrives later and must lose
    const final = await device()();
    expect(final.changes.tasks?.find((x) => x.clientId === t.clientId)?.title).toBe('Newer (from B)');
  });

  it('a delete propagates as a tombstone', async () => {
    const a = device();
    const b = device();
    const t = task();
    await a({ tasks: [t] });
    expect((await b()).changes.tasks).toHaveLength(1);
    await a({ tasks: [{ ...t, deletedAt: iso(1000), updatedAt: iso(1000) }] });
    const got = await b();
    expect(got.changes.tasks?.[0]).toMatchObject({ clientId: t.clientId, deletedAt: expect.any(String) });
    // a fresh device doesn't download tombstones at all
    expect((await device()()).changes.tasks).toBeUndefined();
  });

  it('attendance syncs by date: two devices marking the same day end up with one entry', async () => {
    const d = localDate(new Date(), 'Asia/Dubai');
    const a = device();
    const b = device();
    const day = (status: string, work: number, at: number) => ({ clientId: randomUUID(), createdAt: iso(), updatedAt: iso(at), deletedAt: null, date: d, status, workMinutes: work, overtimeMinutes: 0, note: '' });
    await a({ attendance: [day('present', 480, 0)] });
    await b({ attendance: [day('off', 0, 1000)] });
    expect(await AttendanceModel.countDocuments({ date: d })).toBe(1);
    const got = await a();
    expect(got.changes.attendance?.[0]).toMatchObject({ date: d, status: 'off' });
  });

  it('rejects invalid records one by one without blocking the rest', async () => {
    const good = task();
    const bad = task({ title: '' });
    const futureWork = { clientId: randomUUID(), createdAt: iso(), updatedAt: iso(), deletedAt: null, date: addDays(localDate(new Date(), 'Asia/Dubai'), 3), status: 'present', workMinutes: 480, overtimeMinutes: 0, note: '' };
    const r = await device()({ tasks: [good, bad], attendance: [futureWork] });
    expect(r.applied).toBe(1);
    expect(r.rejected.map((x) => x.collection).sort()).toEqual(['attendance', 'tasks']);
    expect(r.changes.tasks?.map((x) => x.clientId)).toEqual([good.clientId]);
  });

  it('settings edited offline apply only if newer than the stored ones', async () => {
    const a = device();
    expect((await a(undefined, { updatedAt: iso(-60_000), patch: { weekStart: 0 } })).user.weekStart).toBe(0);
    await request(app).patch('/api/v1/auth/me').set('Authorization', auth).send({ weekStart: 1 }); // online edit, now
    const stale = await a(undefined, { updatedAt: iso(-30_000), patch: { weekStart: 0 } }); // older offline edit arrives late
    expect(stale.user.weekStart).toBe(1);
  });

  it("never leaks another user's records", async () => {
    await device()({ tasks: [task()] });
    const r = await request(app).post('/api/v1/auth/register').set('X-Client', 'native').send({ email: 'other@example.com', password: 'password-123' });
    const other = device(() => `Bearer ${r.body.accessToken as string}`);
    expect((await other()).changes.tasks).toBeUndefined();
    expect((await request(app).post('/api/v1/sync').send({ lastSyncedAt: null })).status).toBe(401);
  });
});
