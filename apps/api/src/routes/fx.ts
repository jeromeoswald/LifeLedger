import { Router } from 'express';
import { z } from 'zod';
import {
  CURRENCIES,
  EXCHANGE_RATE_API_ATTRIBUTION,
  convertMinor,
  crossRate,
  currencyCode,
  dateStr,
  fromMinor,
  toMinor,
} from '@lifeledger/shared';
import { requireAuth } from '../lib/tokens';
import { HttpError } from '../lib/http';
import type { RatesService } from '../fx/service';
import type { createHistoryService } from '../fx/history';

const meta = (s: Awaited<ReturnType<RatesService['latest']>>) => ({
  date: s.date,
  fetchedAt: s.fetchedAt,
  source: s.source,
  stale: !!s.stale,
  attribution: EXCHANGE_RATE_API_ATTRIBUTION,
});

const rateOr400 = (rates: Parameters<typeof crossRate>[0], from: string, to: string) => {
  try {
    return crossRate(rates, from, to);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
};

export function fxRouter(rates: RatesService, history: ReturnType<typeof createHistoryService>) {
  const r = Router();
  r.use(requireAuth);

  r.get('/currencies', async (_req, res) => {
    const s = await rates.latest().catch(() => null);
    res.json({ currencies: CURRENCIES.map((c) => ({ ...c, supported: !!s?.rates[c.code] })) });
  });

  /** No base: the raw USD snapshot (what clients cache). With ?base=AED: every rate as 1 AED = x. */
  r.get('/latest', async (req, res) => {
    const { base } = z.object({ base: currencyCode.optional() }).parse(req.query);
    const s = await rates.latest();
    if (!base || base === 'USD') {
      res.json({ base: 'USD', ...meta(s), rates: s.rates });
      return;
    }
    rateOr400(s, base, 'USD');
    const out = Object.fromEntries(Object.keys(s.rates).map((code) => [code, crossRate(s, base, code)]));
    res.json({ base, ...meta(s), rates: out });
  });

  r.get('/convert', async (req, res) => {
    const q = z
      .object({ from: currencyCode, to: currencyCode, amount: z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a plain number like 125.50') })
      .parse(req.query);
    const s = await rates.latest();
    const rate = rateOr400(s, q.from, q.to);
    const resultMinor = convertMinor(toMinor(q.amount, q.from), q.from, q.to, rate);
    res.json({
      from: q.from,
      to: q.to,
      amount: fromMinor(toMinor(q.amount, q.from), q.from),
      result: fromMinor(resultMinor, q.to),
      rate,
      inverseRate: crossRate(s, q.to, q.from),
      ...meta(s),
    });
  });

  r.get('/history', async (req, res) => {
    const q = z.object({ from: currencyCode, to: currencyCode, start: dateStr, end: dateStr }).parse(req.query);
    const { points, source } = await history(q.from, q.to, q.start, q.end);
    res.json({ ...q, source, points });
  });

  return r;
}
