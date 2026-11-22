import { z } from 'zod';
import { crossRate, daysBetween } from '@lifeledger/shared';
import { HttpError } from '../lib/http';
import { FxRateModel } from './service';

/** Currencies with a fixed USD peg (central-bank rates). Frankfurter (ECB data) has none of them. */
export const USD_PEGS: Record<string, string> = { AED: '3.6725', SAR: '3.75', QAR: '3.64', OMR: '0.3845', BHD: '0.376' };

/** Daily USD-based rates for a date range: date -> { code: rate }. */
export type HistorySource = (start: string, end: string, symbols: string[]) => Promise<Record<string, Record<string, string>>>;

export function frankfurterHistory(baseUrl: string): HistorySource {
  const schema = z.object({ rates: z.record(z.string(), z.record(z.string(), z.number().positive())) });
  return async (start, end, symbols) => {
    const url = `${baseUrl.replace(/\/$/, '')}/${start}..${end}?base=USD&symbols=${symbols.join(',')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`frankfurter history answered ${res.status}`);
    const { rates } = schema.parse(await res.json());
    return Object.fromEntries(Object.entries(rates).map(([d, r]) => [d, Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))]));
  };
}

export interface HistoryPoint {
  date: string;
  rate: string;
}

const CACHE_MS = 6 * 60 * 60 * 1000;
export const MAX_DAYS = 370;

/**
 * Rate history A→B. Uses Frankfurter (with USD pegs filled in); if it lacks a currency or fails,
 * falls back to the daily snapshots we stored from the primary provider (sparser, but always ours).
 */
export function createHistoryService(source: HistorySource, now: () => Date = () => new Date()) {
  const cache = new Map<string, { at: number; points: HistoryPoint[]; source: string }>();

  async function fromSnapshots(from: string, to: string, start: string, end: string) {
    const docs = await FxRateModel.find({ date: { $gte: start, $lte: end } }).sort({ date: 1, fetchedAt: 1 }).lean<{ date: string; rates: Record<string, string> }[]>();
    const byDate = new Map(docs.map((d) => [d.date, d.rates])); // later fetch of the same date wins
    const out: HistoryPoint[] = [];
    for (const [date, rates] of byDate) {
      try {
        out.push({ date, rate: crossRate({ rates }, from, to) });
      } catch {
        // currency missing that day
      }
    }
    return out;
  }

  return async function history(from: string, to: string, start: string, end: string) {
    if (start > end) throw new HttpError(400, 'start must be on or before end');
    if (daysBetween(start, end) > MAX_DAYS) throw new HttpError(400, `At most ${MAX_DAYS} days per request`);
    const key = `${from}:${to}:${start}:${end}`;
    const hit = cache.get(key);
    if (hit && now().getTime() - hit.at < CACHE_MS) return { points: hit.points, source: hit.source };

    const symbols = [from, to].filter((c) => c !== 'USD' && !USD_PEGS[c]);
    let points: HistoryPoint[] = [];
    let src = 'frankfurter';
    try {
      // null = no lookup needed: same currency, or both sides are USD / pegged (a flat line)
      const series = from !== to && symbols.length ? await source(start, end, symbols) : null;
      if (series) {
        for (const [date, r] of Object.entries(series).sort(([a], [b]) => a.localeCompare(b))) {
          if (symbols.every((s) => r[s])) points.push({ date, rate: crossRate({ rates: { USD: '1', ...USD_PEGS, ...r } }, from, to) });
        }
      } else {
        points = [{ date: start, rate: crossRate({ rates: { USD: '1', ...USD_PEGS } }, from, to) }, { date: end, rate: crossRate({ rates: { USD: '1', ...USD_PEGS } }, from, to) }];
        src = from === to ? 'identity' : 'usd-peg';
      }
    } catch (e) {
      console.warn('[fx] history source failed:', (e as Error).message);
    }
    if (!points.length) {
      points = await fromSnapshots(from, to, start, end);
      src = 'stored-snapshots';
    }
    cache.set(key, { at: now().getTime(), points, source: src });
    return { points, source: src };
  };
}
