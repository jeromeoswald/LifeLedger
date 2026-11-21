import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { convertMinor, crossRate } from '@lifeledger/shared';
import { connectDb } from '../src/db';
import { createApp } from '../src/app';
import { createRatesService, FxRateModel, CACHE_MS } from '../src/fx/service';
import type { RateProvider } from '../src/fx/providers';
import { UserModel } from '../src/models/User';
import { SessionModel } from '../src/models/Session';
import { AccountModel, TransactionModel } from '../src/models/synced';

const PRIMARY = { USD: '1', AED: '3.6725', INR: '93.372746', JPY: '154.32' };

function fakes() {
  const primary = { name: 'exchangerate-api', latest: vi.fn(async () => ({ date: '2026-11-20', rates: { ...PRIMARY } })) } satisfies RateProvider;
  const fallback = { name: 'frankfurter', latest: vi.fn(async () => ({ date: '2026-11-21', rates: { USD: '1', INR: '92.68' } })) } satisfies RateProvider;
  return { primary, fallback };
}

let clock = new Date('2026-11-22T06:00:00Z');
const now = () => clock;

beforeAll(async () => {
  await connectDb();
  await Promise.all([FxRateModel.init(), UserModel.init(), SessionModel.init(), AccountModel.init(), TransactionModel.init()]);
});
beforeEach(async () => {
  await Promise.all([FxRateModel.deleteMany({}), UserModel.deleteMany({}), SessionModel.deleteMany({}), TransactionModel.deleteMany({})]);
  clock = new Date('2026-11-22T06:00:00Z');
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('rates service', () => {
  it('caches for 6 hours, then refreshes', async () => {
    const { primary, fallback } = fakes();
    const svc = createRatesService(primary, fallback, now);
    expect((await svc.latest()).rates.AED).toBe('3.6725');
    await svc.latest();
    expect(primary.latest).toHaveBeenCalledTimes(1);
    clock = new Date(clock.getTime() + CACHE_MS + 1000);
    await svc.latest();
    expect(primary.latest).toHaveBeenCalledTimes(2);
    expect(await FxRateModel.countDocuments()).toBe(1); // same rate date: one stored snapshot
  });

  it('falls back to Frankfurter and keeps currencies it lacks (AED) from the last snapshot', async () => {
    const { primary, fallback } = fakes();
    const svc = createRatesService(primary, fallback, now);
    await svc.latest();
    primary.latest.mockRejectedValueOnce(new Error('down'));
    const s = await svc.refresh();
    expect(s.source).toBe('frankfurter');
    expect(s.rates.INR).toBe('92.68'); // fresh from the fallback
    expect(s.rates.AED).toBe('3.6725'); // carried over
  });

  it('serves the last snapshot marked stale when both providers fail', async () => {
    const { primary, fallback } = fakes();
    const svc = createRatesService(primary, fallback, now);
    await svc.latest();
    clock = new Date(clock.getTime() + CACHE_MS + 1000);
    primary.latest.mockRejectedValue(new Error('down'));
    fallback.latest.mockRejectedValue(new Error('down too'));
    const s = await svc.latest();
    expect(s).toMatchObject({ stale: true, date: '2026-11-20' });
  });

  it('503s when there is nothing cached and nothing reachable', async () => {
    const { primary, fallback } = fakes();
    primary.latest.mockRejectedValue(new Error('x'));
    fallback.latest.mockRejectedValue(new Error('y'));
    await expect(createRatesService(primary, fallback, now).latest()).rejects.toMatchObject({ status: 503 });
  });

  it('does not hit the provider twice for concurrent requests', async () => {
    const { primary, fallback } = fakes();
    const svc = createRatesService(primary, fallback, now);
    await Promise.all([svc.latest(), svc.latest(), svc.latest()]);
    expect(primary.latest).toHaveBeenCalledTimes(1);
  });
});

describe('fx + wallet endpoints', () => {
  const { primary, fallback } = fakes();
  const app = createApp({ rates: createRatesService(primary, fallback, now) });
  let auth = '';
  beforeEach(async () => {
    const r = await request(app).post('/api/v1/auth/register').set('X-Client', 'native').send({ email: 'j@example.com', password: 'password-123' });
    auth = `Bearer ${r.body.accessToken as string}`;
  });

  it('needs auth', async () => {
    expect((await request(app).get('/api/v1/fx/latest')).status).toBe(401);
  });

  it('latest: raw USD snapshot, or cross rates for a base, with attribution', async () => {
    const usd = await request(app).get('/api/v1/fx/latest').set('Authorization', auth);
    expect(usd.body).toMatchObject({ base: 'USD', date: '2026-11-20', stale: false, attribution: { text: 'Rates By Exchange Rate API' } });
    const aed = await request(app).get('/api/v1/fx/latest?base=aed').set('Authorization', auth);
    expect(aed.body.base).toBe('AED');
    expect(aed.body.rates.INR).toBe(crossRate({ rates: PRIMARY }, 'AED', 'INR'));
    expect(aed.body.rates.AED).toBe('1');
  });

  it('convert: decimal-exact with rates both ways', async () => {
    const r = await request(app).get('/api/v1/fx/convert?from=AED&to=INR&amount=100').set('Authorization', auth);
    expect(r.body).toMatchObject({ from: 'AED', to: 'INR', amount: '100.00', result: '2542.48', rate: '25.4248457454' });
    expect(r.body.inverseRate).toBe(crossRate({ rates: PRIMARY }, 'INR', 'AED'));
    const jpy = await request(app).get('/api/v1/fx/convert?from=USD&to=JPY&amount=10.5').set('Authorization', auth);
    expect(jpy.body.result).toBe('1620'); // 1620.36 → 0 decimals for JPY
  });

  it('convert: rejects bad input and unknown currencies', async () => {
    expect((await request(app).get('/api/v1/fx/convert?from=AED&to=INR&amount=1e5').set('Authorization', auth)).status).toBe(400);
    expect((await request(app).get('/api/v1/fx/convert?from=AED&to=ZZZ&amount=1').set('Authorization', auth)).status).toBe(400);
    expect((await request(app).get('/api/v1/fx/convert?from=AED&to=XAF&amount=1').set('Authorization', auth)).status).toBe(400); // no rate
  });

  it('currencies list flags which ones have a rate', async () => {
    const r = await request(app).get('/api/v1/fx/currencies').set('Authorization', auth);
    const byCode = Object.fromEntries((r.body.currencies as { code: string; supported: boolean; digits: number }[]).map((c) => [c.code, c]));
    expect(byCode.INR).toMatchObject({ supported: true, digits: 2 });
    expect(byCode.XAF!.supported).toBe(false);
  });

  it('a transaction stores its frozen base amount; a mismatching one is rejected', async () => {
    const rate = crossRate({ rates: PRIMARY }, 'USD', 'AED');
    const now0 = new Date().toISOString();
    const t = {
      clientId: randomUUID(),
      createdAt: now0,
      updatedAt: now0,
      type: 'expense',
      date: '2026-11-22',
      accountId: randomUUID(),
      amountMinor: 20_00,
      currency: 'USD',
      accountAmountMinor: 73_45,
      baseCurrency: 'AED',
      fxRateToBase: rate,
      amountBaseMinor: convertMinor(20_00, 'USD', 'AED', rate),
      rateDate: '2026-11-20',
      rateSource: 'exchangerate-api',
    };
    const ok = await request(app).put(`/api/v1/transactions/${t.clientId}`).set('Authorization', auth).send(t);
    expect(ok.status).toBe(201);
    expect(ok.body.item).toMatchObject({ amountBaseMinor: 73_45, fxRateToBase: '3.6725' });
    const bad = { ...t, clientId: randomUUID(), amountBaseMinor: 99_99 };
    expect((await request(app).put(`/api/v1/transactions/${bad.clientId}`).set('Authorization', auth).send(bad)).status).toBe(400);
  });
});
