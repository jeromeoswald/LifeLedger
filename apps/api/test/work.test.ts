import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDb } from '../src/db';
import { createApp } from '../src/app';
import { UserModel } from '../src/models/User';
import { SessionModel } from '../src/models/Session';
import { DailyLogModel, HabitEntryModel, HabitModel, TaskModel, TimeSessionModel } from '../src/models/synced';

const app = createApp();

async function signUp(email: string) {
  const res = await request(app).post('/api/v1/auth/register').set('X-Client', 'native').send({ email, password: 'password-123' });
  return `Bearer ${res.body.accessToken as string}`;
}

const task = (p: Record<string, unknown> = {}) => {
  const now = new Date().toISOString();
  return { clientId: randomUUID(), createdAt: now, updatedAt: now, title: 'Write report', ...p };
};

let auth: string;
beforeAll(async () => {
  await connectDb();
  await Promise.all([UserModel.init(), SessionModel.init(), TaskModel.init(), TimeSessionModel.init(), DailyLogModel.init(), HabitModel.init(), HabitEntryModel.init()]);
});
beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    SessionModel.deleteMany({}),
    TaskModel.deleteMany({}),
    TimeSessionModel.deleteMany({}),
    DailyLogModel.deleteMany({}),
    HabitModel.deleteMany({}),
    HabitEntryModel.deleteMany({}),
  ]);
  auth = await signUp('jerome@example.com');
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('tasks API', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/v1/tasks')).status).toBe(401);
  });

  it('creates, lists and updates by clientId with defaults', async () => {
    const t = task({ dueDate: '2026-11-22', dueTime: '10:00' });
    const created = await request(app).put(`/api/v1/tasks/${t.clientId}`).set('Authorization', auth).send(t);
    expect(created.status).toBe(201);
    expect(created.body.item).toMatchObject({ clientId: t.clientId, priority: 'medium', status: 'todo', alarms: [], deletedAt: null });
    expect(created.body.item.userId).toBeUndefined();

    const later = new Date(Date.now() + 1000).toISOString();
    const upd = await request(app).put(`/api/v1/tasks/${t.clientId}`).set('Authorization', auth).send({ ...t, status: 'done', completedAt: later, updatedAt: later });
    expect(upd.status).toBe(200);

    const list = await request(app).get('/api/v1/tasks').set('Authorization', auth);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ status: 'done', completedAt: later });
  });

  it('latest updatedAt wins: an older write is ignored', async () => {
    const t = task();
    const newer = new Date(Date.now() + 5000).toISOString();
    await request(app).put(`/api/v1/tasks/${t.clientId}`).set('Authorization', auth).send({ ...t, title: 'Newer', updatedAt: newer });
    const stale = await request(app).put(`/api/v1/tasks/${t.clientId}`).set('Authorization', auth).send({ ...t, title: 'Older' });
    expect(stale.body).toMatchObject({ stale: true, item: { title: 'Newer' } });
  });

  it('soft-deletes', async () => {
    const t = task();
    await request(app).put(`/api/v1/tasks/${t.clientId}`).set('Authorization', auth).send(t);
    expect((await request(app).delete(`/api/v1/tasks/${t.clientId}`).set('Authorization', auth)).status).toBe(204);
    expect((await request(app).get('/api/v1/tasks').set('Authorization', auth)).body.items).toHaveLength(0);
    expect((await TaskModel.findOne({ clientId: t.clientId }).lean())?.deletedAt).toBeInstanceOf(Date);
  });

  it("keeps users' data apart", async () => {
    const t = task();
    await request(app).put(`/api/v1/tasks/${t.clientId}`).set('Authorization', auth).send(t);
    const other = await signUp('other@example.com');
    expect((await request(app).get('/api/v1/tasks').set('Authorization', other)).body.items).toHaveLength(0);
    expect((await request(app).delete(`/api/v1/tasks/${t.clientId}`).set('Authorization', other)).status).toBe(404);
    // same clientId from another user creates their own record, never touches ours
    await request(app).put(`/api/v1/tasks/${t.clientId}`).set('Authorization', other).send({ ...t, title: 'Theirs', updatedAt: new Date(Date.now() + 9000).toISOString() });
    const mine = await request(app).get('/api/v1/tasks').set('Authorization', auth);
    expect(mine.body.items[0].title).toBe('Write report');
  });

  it('validates input', async () => {
    const t = task();
    const bad = await request(app).put(`/api/v1/tasks/${t.clientId}`).set('Authorization', auth).send({ ...t, title: '', priority: 'whenever' });
    expect(bad.status).toBe(400);
    expect((await request(app).put('/api/v1/tasks/not-a-uuid').set('Authorization', auth).send(t)).status).toBe(400);
  });
});

describe('habits API', () => {
  it('stores a habit and its entries, and rejects bad schedules', async () => {
    const now = new Date().toISOString();
    const h = { clientId: randomUUID(), createdAt: now, updatedAt: now, name: 'Drink water', type: 'count', target: 8, unit: 'glasses', schedule: { kind: 'daily' }, startDate: '2026-11-22' };
    const created = await request(app).put(`/api/v1/habits/${h.clientId}`).set('Authorization', auth).send(h);
    expect(created.status).toBe(201);
    expect(created.body.item).toMatchObject({ schedule: { kind: 'daily' }, reminderTime: null, archivedAt: null });

    const bad = { ...h, clientId: randomUUID(), schedule: { kind: 'perWeek', times: 9 } };
    expect((await request(app).put(`/api/v1/habits/${bad.clientId}`).set('Authorization', auth).send(bad)).status).toBe(400);

    const e = { clientId: randomUUID(), createdAt: now, updatedAt: now, habitId: h.clientId, date: '2026-11-22', value: 5 };
    const created2 = await request(app).put(`/api/v1/habit-entries/${e.clientId}`).set('Authorization', auth).send(e);
    expect(created2.status).toBe(201);
    expect(created2.body.item.note).toBe(''); // older clients without notes still work

    const later = new Date(Date.now() + 1000).toISOString();
    await request(app).put(`/api/v1/habit-entries/${e.clientId}`).set('Authorization', auth).send({ ...e, note: '  Pages 45–72  ', updatedAt: later });
    const list = await request(app).get('/api/v1/habit-entries').set('Authorization', auth);
    expect(list.body.items).toEqual([expect.objectContaining({ habitId: h.clientId, date: '2026-11-22', value: 5, note: 'Pages 45–72' })]);

    const tooLong = { ...e, note: 'x'.repeat(501), updatedAt: new Date(Date.now() + 2000).toISOString() };
    expect((await request(app).put(`/api/v1/habit-entries/${e.clientId}`).set('Authorization', auth).send(tooLong)).status).toBe(400);
  });
});

describe('time sessions + daily logs API', () => {
  it('stores a session and a log', async () => {
    const now = new Date().toISOString();
    const s = { clientId: randomUUID(), createdAt: now, updatedAt: now, taskId: randomUUID(), startedAt: now };
    expect((await request(app).put(`/api/v1/time-sessions/${s.clientId}`).set('Authorization', auth).send(s)).body.item.endedAt).toBeNull();
    const bad = { ...s, endedAt: new Date(Date.now() - 60_000).toISOString() };
    expect((await request(app).put(`/api/v1/time-sessions/${s.clientId}`).set('Authorization', auth).send(bad)).status).toBe(400);

    const log = { clientId: randomUUID(), createdAt: now, updatedAt: now, date: '2026-11-22', done: 'Shipped phase 2', blockers: '', tomorrow: 'Habits' };
    expect((await request(app).put(`/api/v1/daily-logs/${log.clientId}`).set('Authorization', auth).send(log)).status).toBe(201);
    expect((await request(app).get('/api/v1/daily-logs').set('Authorization', auth)).body.items[0].done).toBe('Shipped phase 2');
  });
});
