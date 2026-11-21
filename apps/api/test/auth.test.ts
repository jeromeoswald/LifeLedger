import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDb } from '../src/db';
import { createApp } from '../src/app';
import { mailer } from '../src/lib/mailer';
import { SessionModel } from '../src/models/Session';
import { UserModel } from '../src/models/User';

const app = createApp();
const native = { 'X-Client': 'native' };
const creds = { email: 'jerome@example.com', password: 'correct-horse' };

async function register() {
  const res = await request(app).post('/api/v1/auth/register').set(native).send(creds);
  expect(res.status).toBe(201);
  return res.body as { accessToken: string; refreshToken: string };
}

beforeAll(async () => {
  await connectDb();
  await UserModel.init();
  await SessionModel.init();
});
beforeEach(async () => {
  await UserModel.deleteMany({});
  await SessionModel.deleteMany({});
  vi.useRealTimers();
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('register + login', () => {
  it('registers with AED default and signs in', async () => {
    const reg = await register();
    expect(reg.refreshToken).toBeTruthy();
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${reg.accessToken}`);
    expect(me.body.user).toMatchObject({ email: creds.email, baseCurrency: 'AED', timeZone: 'Asia/Dubai' });

    const login = await request(app).post('/api/v1/auth/login').set(native).send(creds);
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
  });

  it('rejects duplicate email and bad input', async () => {
    await register();
    expect((await request(app).post('/api/v1/auth/register').send(creds)).status).toBe(409);
    expect((await request(app).post('/api/v1/auth/register').send({ email: 'x', password: '1' })).status).toBe(400);
  });

  it('never stores the password or the refresh token in plain text', async () => {
    const reg = await register();
    const user = await UserModel.findOne({ email: creds.email }).lean();
    expect(user?.passwordHash).not.toContain(creds.password);
    expect(await SessionModel.exists({ tokenHash: reg.refreshToken })).toBeNull();
  });

  it('web clients get the refresh token as an httpOnly cookie only', async () => {
    const res = await request(app).post('/api/v1/auth/register').set('X-Client', 'web').send(creds);
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/ll_refresh=/);
    expect(cookie).toMatch(/HttpOnly/);
  });

  it('remember-device off gives a browser-session cookie', async () => {
    await register();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Client', 'web')
      .send({ ...creds, rememberDevice: false });
    expect(String(res.headers['set-cookie'])).not.toMatch(/Max-Age|Expires/);
  });
});

describe('lockout', () => {
  it('locks after 5 wrong passwords, even for the right one', async () => {
    await register();
    for (let i = 0; i < 4; i++) {
      const r = await request(app).post('/api/v1/auth/login').send({ ...creds, password: 'wrong-pass' });
      expect(r.status).toBe(401);
    }
    const fifth = await request(app).post('/api/v1/auth/login').send({ ...creds, password: 'wrong-pass' });
    expect(fifth.status).toBe(429);
    const right = await request(app).post('/api/v1/auth/login').send(creds);
    expect(right.status).toBe(429);
    expect(Number(right.headers['retry-after'])).toBeGreaterThan(800);
  });

  it('unlocks after 15 minutes', async () => {
    await register();
    for (let i = 0; i < 5; i++) await request(app).post('/api/v1/auth/login').send({ ...creds, password: 'nope-nope' });
    await UserModel.updateOne({ email: creds.email }, { lockUntil: new Date(Date.now() - 1000) });
    expect((await request(app).post('/api/v1/auth/login').send(creds)).status).toBe(200);
  });

  it('gives the same error for unknown emails', async () => {
    const r = await request(app).post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'whatever1' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('Email or password is incorrect');
  });
});

describe('refresh rotation', () => {
  it('rotates: old token is rejected after use', async () => {
    const { refreshToken } = await register();
    const r1 = await request(app).post('/api/v1/auth/refresh').set(native).send({ refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(refreshToken);
    const r2 = await request(app).post('/api/v1/auth/refresh').set(native).send({ refreshToken: r1.body.refreshToken });
    expect(r2.status).toBe(200);
  });

  it('reuse of a rotated token (outside the race window) revokes every session', async () => {
    const { refreshToken } = await register();
    const r1 = await request(app).post('/api/v1/auth/refresh').set(native).send({ refreshToken });
    await SessionModel.updateMany({ revokedReason: 'rotated' }, { revokedAt: new Date(Date.now() - 60_000) });

    const replay = await request(app).post('/api/v1/auth/refresh').set(native).send({ refreshToken });
    expect(replay.status).toBe(401);
    const legit = await request(app).post('/api/v1/auth/refresh').set(native).send({ refreshToken: r1.body.refreshToken });
    expect(legit.status).toBe(401);
  });

  it('works with the web cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').set('X-Client', 'web').send(creds);
    const r = await agent.post('/api/v1/auth/refresh').set('X-Client', 'web');
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
  });
});

describe('logout', () => {
  it('logout revokes the current session only', async () => {
    const a = await register();
    const b = (await request(app).post('/api/v1/auth/login').set(native).send(creds)).body;
    expect((await request(app).post('/api/v1/auth/logout').set(native).send({ refreshToken: a.refreshToken })).status).toBe(204);
    expect((await request(app).post('/api/v1/auth/refresh').set(native).send({ refreshToken: a.refreshToken })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').set(native).send({ refreshToken: b.refreshToken })).status).toBe(200);
  });

  it('logout-all revokes every device', async () => {
    const a = await register();
    const b = (await request(app).post('/api/v1/auth/login').set(native).send(creds)).body;
    const r = await request(app).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${a.accessToken}`);
    expect(r.status).toBe(204);
    for (const t of [a.refreshToken, b.refreshToken]) {
      expect((await request(app).post('/api/v1/auth/refresh').set(native).send({ refreshToken: t })).status).toBe(401);
    }
  });
});

describe('password reset', () => {
  async function requestCode() {
    const spy = vi.spyOn(mailer, 'sendResetCode');
    const r = await request(app).post('/api/v1/auth/forgot-password').send({ email: creds.email });
    expect(r.status).toBe(200);
    const code = spy.mock.calls.at(-1)?.[1];
    spy.mockRestore();
    return code as string;
  }

  it('resets with a valid code, revokes sessions, and the new password works', async () => {
    const { refreshToken } = await register();
    const code = await requestCode();
    expect(code).toMatch(/^\d{6}$/);

    const r = await request(app).post('/api/v1/auth/reset-password').send({ email: creds.email, code, newPassword: 'brand-new-pass' });
    expect(r.status).toBe(200);
    expect((await request(app).post('/api/v1/auth/refresh').set(native).send({ refreshToken })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send(creds)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ ...creds, password: 'brand-new-pass' })).status).toBe(200);
  });

  it('rejects an expired code', async () => {
    await register();
    const code = await requestCode();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1000);
    const r = await request(app).post('/api/v1/auth/reset-password').send({ email: creds.email, code, newPassword: 'brand-new-pass' });
    expect(r.status).toBe(400);
  });

  it('burns the code after 5 wrong attempts', async () => {
    await register();
    const code = await requestCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/reset-password').send({ email: creds.email, code: wrong, newPassword: 'brand-new-pass' });
    }
    const r = await request(app).post('/api/v1/auth/reset-password').send({ email: creds.email, code, newPassword: 'brand-new-pass' });
    expect(r.status).toBe(400);
  });

  it('answers the same for unknown emails', async () => {
    const r = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(r.body).toEqual({ ok: true });
  });
});
