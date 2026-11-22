import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { taskSchema, habitSchema, zonedToInstant } from '@lifeledger/shared';
import { connectDb } from '../src/db';
import { createApp } from '../src/app';
import { UserModel } from '../src/models/User';
import { SessionModel } from '../src/models/Session';
import { HabitModel, TaskModel } from '../src/models/synced';
import { PushSubscriptionModel, duePushes, runPushTick } from '../src/push/push';

const DXB = 'Asia/Dubai';
const T0 = '2026-11-01T00:00:00.000Z';
const task = (p: object) => taskSchema.parse({ clientId: randomUUID(), createdAt: T0, updatedAt: T0, title: 'Call the bank', ...p });
const habit = (p: object) => habitSchema.parse({ clientId: randomUUID(), createdAt: T0, updatedAt: T0, name: 'Read', type: 'yesno', schedule: { kind: 'daily' }, startDate: '2026-11-01', ...p });

describe('duePushes (what the minute job sends)', () => {
  const at = (date: string, time: string) => zonedToInstant(date, time, DXB);

  it('task alarms inside the window, not done, not deleted', () => {
    const t = task({ dueDate: '2026-11-22', dueTime: '10:00', alarms: [{ id: 'a', kind: 'before', minutesBefore: 15 }] });
    const window = [at('2026-11-22', '09:44'), at('2026-11-22', '09:45')] as const;
    expect(duePushes([t], [], DXB, ...window).map((d) => d.title)).toEqual(['Call the bank']);
    expect(duePushes([{ ...t, status: 'done' }], [], DXB, ...window)).toEqual([]);
    expect(duePushes([t], [], DXB, at('2026-11-22', '09:45'), at('2026-11-22', '09:46'))).toEqual([]); // window end is inclusive, start exclusive
  });

  it('habit reminders on scheduled days only, in the user time zone', () => {
    const weekdays = habit({ reminderTime: '07:00', schedule: { kind: 'weekdays', days: [1] } }); // Mondays
    expect(duePushes([], [weekdays], DXB, at('2026-11-23', '06:59'), at('2026-11-23', '07:00'))).toHaveLength(1); // Mon
    expect(duePushes([], [weekdays], DXB, at('2026-11-22', '06:59'), at('2026-11-22', '07:00'))).toHaveLength(0); // Sun
  });
});

describe('push API + scheduler', () => {
  const app = createApp();
  let auth = '';
  beforeAll(async () => {
    await connectDb();
    await Promise.all([UserModel.init(), SessionModel.init(), PushSubscriptionModel.init()]);
  });
  beforeEach(async () => {
    await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({}), TaskModel.deleteMany({}), HabitModel.deleteMany({}), PushSubscriptionModel.deleteMany({})]);
    const r = await request(app).post('/api/v1/auth/register').set('X-Client', 'native').send({ email: 'p@example.com', password: 'password-123' });
    auth = `Bearer ${r.body.accessToken as string}`;
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('security headers and /health', async () => {
    const r = await request(app).get('/health');
    expect(r.body).toEqual({ ok: true });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['strict-transport-security']).toBeDefined();
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  it('serves a public key and stores a subscription', async () => {
    const k = await request(app).get('/api/v1/push/public-key').set('Authorization', auth);
    expect(k.body.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } };
    expect((await request(app).post('/api/v1/push/subscribe').set('Authorization', auth).send(sub)).status).toBe(201);
    expect((await request(app).post('/api/v1/push/subscribe').set('Authorization', auth).send({ ...sub, endpoint: 'http://insecure' })).status).toBe(400);
    expect(await PushSubscriptionModel.countDocuments()).toBe(1);
  });

  it('sends a due alarm once, and drops a subscription the browser removed', async () => {
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', auth);
    const userId = (await UserModel.findOne({ email: me.body.user.email }))!._id;
    const when = new Date(Date.now() + 30_000);
    const t = task({ alarms: [{ id: 'x', kind: 'at', at: when.toISOString() }] });
    await TaskModel.create({ ...t, userId });
    await PushSubscriptionModel.create([
      { userId, endpoint: 'https://push.example.com/live', keys: { p256dh: 'p', auth: 'a' } },
      { userId, endpoint: 'https://push.example.com/gone', keys: { p256dh: 'p', auth: 'a' } },
    ]);
    const send = vi.fn(async (s: { endpoint: string }, _payload: string) => {
      if (s.endpoint.endsWith('gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    });
    const from = new Date(when.getTime() - 60_000);
    expect(await runPushTick(from, when, send)).toBe(1);
    expect(JSON.parse(send.mock.calls[0]![1] as string)).toMatchObject({ title: 'Call the bank', url: `/task/${t.clientId}` });
    expect(await PushSubscriptionModel.countDocuments()).toBe(1); // the 410 one was removed
    expect(await runPushTick(from, when, send)).toBe(0); // second run of the same window: nothing re-sent
  });
});
