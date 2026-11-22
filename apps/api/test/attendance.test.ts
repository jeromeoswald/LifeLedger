import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { addDays, localDate } from '@lifeledger/shared';
import { connectDb } from '../src/db';
import { createApp } from '../src/app';
import { UserModel } from '../src/models/User';
import { SessionModel } from '../src/models/Session';
import { AttendanceModel } from '../src/models/synced';

const app = createApp();
const today = () => localDate(new Date(), 'Asia/Dubai');
let auth = '';

const entry = (p: Record<string, unknown> = {}) => {
  const now = new Date().toISOString();
  return { clientId: randomUUID(), createdAt: now, updatedAt: now, status: 'present', workMinutes: 480, overtimeMinutes: 0, ...p };
};
const put = (date: string, body: object, token = auth) => request(app).put(`/api/v1/attendance/${date}`).set('Authorization', token).send(body);

async function signUp(email: string) {
  const r = await request(app).post('/api/v1/auth/register').set('X-Client', 'native').send({ email, password: 'password-123' });
  return `Bearer ${r.body.accessToken as string}`;
}

beforeAll(async () => {
  await connectDb();
  await Promise.all([UserModel.init(), SessionModel.init(), AttendanceModel.init()]);
});
beforeEach(async () => {
  await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({}), AttendanceModel.deleteMany({})]);
  auth = await signUp('jerome@example.com');
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('attendance API', () => {
  it('new users get the default settings on /me', async () => {
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', auth);
    expect(me.body.user).toMatchObject({ attendanceDefaultMinutes: 480, weekStart: 1, showAttendanceCard: true });
    const upd = await request(app).patch('/api/v1/auth/me').set('Authorization', auth).send({ weekStart: 0, attendanceDefaultMinutes: 540 });
    expect(upd.body.user).toMatchObject({ weekStart: 0, attendanceDefaultMinutes: 540 });
    expect((await request(app).patch('/api/v1/auth/me').set('Authorization', auth).send({ attendanceDefaultMinutes: 500 })).status).toBe(400);
  });

  it('PUT is an idempotent upsert keyed by date', async () => {
    const d = today();
    const e = entry();
    expect((await put(d, e)).status).toBe(201);
    const again = await put(d, e);
    expect(again.status).toBe(200);
    // a second device with a different clientId still updates the same day
    const other = await put(d, entry({ workMinutes: 510, updatedAt: new Date(Date.now() + 1000).toISOString() }));
    expect(other.body.item).toMatchObject({ clientId: e.clientId, workMinutes: 510 });
    expect(await AttendanceModel.countDocuments({ date: d })).toBe(1);
  });

  it('switching away from Present must clear hours', async () => {
    const d = today();
    await put(d, entry());
    const later = new Date(Date.now() + 1000).toISOString();
    expect((await put(d, entry({ status: 'off', updatedAt: later }))).status).toBe(400); // still has 8 h
    const ok = await put(d, entry({ status: 'off', workMinutes: 0, overtimeMinutes: 0, updatedAt: later }));
    expect(ok.body.item).toMatchObject({ status: 'off', workMinutes: 0, overtimeMinutes: 0 });
  });

  it('validates limits and future dates', async () => {
    const d = today();
    expect((await put(d, entry({ workMinutes: 1200, overtimeMinutes: 360 }))).status).toBe(400); // 20 + 6 > 24
    expect((await put(d, entry({ workMinutes: 495 }))).status).toBe(400); // not a 0.5 h step
    expect((await put(d, entry({ overtimeMinutes: 990 }))).status).toBe(400); // OT > 16
    const tomorrow = addDays(d, 1);
    expect((await put(tomorrow, entry())).status).toBe(400);
    expect((await put(tomorrow, entry({ status: 'sick', workMinutes: 0 }))).status).toBe(201);
    expect((await put('2026-02-30', entry())).status).toBe(400);
  });

  it('a newer edit is not overwritten by an older one', async () => {
    const d = today();
    await put(d, entry({ workMinutes: 540, updatedAt: new Date(Date.now() + 5000).toISOString() }));
    const stale = await put(d, entry({ workMinutes: 300 }));
    expect(stale.body).toMatchObject({ stale: true, item: { workMinutes: 540 } });
  });

  it('lists a range, soft-deletes and revives', async () => {
    const d = today();
    await put(d, entry());
    const list = await request(app).get(`/api/v1/attendance?from=${addDays(d, -7)}&to=${d}`).set('Authorization', auth);
    expect(list.body.items).toHaveLength(1);
    expect((await request(app).delete(`/api/v1/attendance/${d}`).set('Authorization', auth)).status).toBe(204);
    expect((await request(app).get(`/api/v1/attendance?from=${d}&to=${d}`).set('Authorization', auth)).body.items).toHaveLength(0);
    const revived = await put(d, entry({ updatedAt: new Date(Date.now() + 2000).toISOString() }));
    expect(revived.body.item.deletedAt).toBeNull();
    expect(await AttendanceModel.countDocuments({ date: d })).toBe(1);
  });

  it("summary endpoint honours the user's week start", async () => {
    const d = today();
    await put(d, entry({ overtimeMinutes: 120 }));
    await put(addDays(d, -1), entry({ status: 'absent', workMinutes: 0 }));
    const s = await request(app).get(`/api/v1/attendance/summary?period=month&date=${d}`).set('Authorization', auth);
    expect(s.body).toMatchObject({ period: 'month', present: 1, workMinutes: 480, overtimeMinutes: 120, manMinutes: 600, avgWorkMinutes: 480 });
    await request(app).patch('/api/v1/auth/me').set('Authorization', auth).send({ weekStart: 0 });
    const w = await request(app).get(`/api/v1/attendance/summary?period=week&date=${d}`).set('Authorization', auth);
    expect(new Date(`${w.body.start}T12:00:00Z`).getUTCDay()).toBe(0); // Sunday start
  });

  it("keeps users' days apart", async () => {
    const d = today();
    await put(d, entry());
    const other = await signUp('other@example.com');
    expect((await request(app).get(`/api/v1/attendance?from=${d}&to=${d}`).set('Authorization', other)).body.items).toHaveLength(0);
    expect((await put(d, entry({ status: 'off', workMinutes: 0 }), other)).status).toBe(201); // their own day
    expect((await request(app).get(`/api/v1/attendance?from=${d}&to=${d}`).set('Authorization', auth)).body.items[0].status).toBe('present');
  });

  it('exports a month as CSV and Excel', async () => {
    const d = today();
    await put(d, entry({ workMinutes: 510, overtimeMinutes: 60, note: 'Site visit, Dubai' }));
    const month = d.slice(0, 7);
    const csv = await request(app).get(`/api/v1/export/attendance.csv?month=${month}`).set('Authorization', auth);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain(`${d},`);
    expect(csv.text).toContain('Present,8.5,1,9.5,"Site visit, Dubai"');
    const xlsx = await request(app).get(`/api/v1/export/attendance.xlsx?month=${month}`).set('Authorization', auth).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(xlsx.headers['content-disposition']).toContain(`attendance-${month}.xlsx`);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // a zip container = xlsx
    expect((await request(app).get('/api/v1/export/attendance.csv?month=2026-13').set('Authorization', auth)).status).toBe(400);
    expect((await request(app).get(`/api/v1/export/attendance.csv?month=${month}`)).status).toBe(401);
  });
});
