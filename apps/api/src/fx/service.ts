import { Schema, model } from 'mongoose';
import { addDays, localDate, zonedToInstant, type RatesSnapshot } from '@lifeledger/shared';
import { HttpError } from '../lib/http';
import type { RateProvider } from './providers';

const fxRateSchema = new Schema(
  {
    date: { type: String, required: true },
    source: { type: String, required: true },
    rates: { type: Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true, index: true },
  },
  { versionKey: false },
);
// One snapshot per provider per rate date; these daily docs also build up our own history.
fxRateSchema.index({ date: 1, source: 1 }, { unique: true });
export const FxRateModel = model('FxRate', fxRateSchema, 'fxRates');

export const CACHE_MS = 6 * 60 * 60 * 1000;

type Doc = { date: string; source: string; rates: Record<string, string>; fetchedAt: Date };
const toSnapshot = (d: Doc, stale = false): RatesSnapshot => ({
  base: 'USD',
  date: d.date,
  source: d.source,
  fetchedAt: d.fetchedAt.toISOString(),
  rates: d.rates,
  ...(stale ? { stale: true } : {}),
});

export interface RatesService {
  latest(): Promise<RatesSnapshot>;
  refresh(): Promise<RatesSnapshot>;
}

export function createRatesService(primary: RateProvider, fallback: RateProvider, now: () => Date = () => new Date()): RatesService {
  let inflight: Promise<RatesSnapshot> | null = null;
  const newest = () => FxRateModel.findOne().sort({ fetchedAt: -1 }).lean<Doc>();

  async function refresh(): Promise<RatesSnapshot> {
    const prev = await newest();
    let got: { date: string; rates: Record<string, string> };
    let source: string;
    try {
      got = await primary.latest();
      source = primary.name;
    } catch (e) {
      console.warn(`[fx] ${primary.name} failed, trying ${fallback.name}:`, (e as Error).message);
      const fb = await fallback.latest();
      // The fallback covers ~30 currencies; keep the others (e.g. AED) from the last good snapshot.
      got = { date: fb.date, rates: { ...(prev?.rates ?? {}), ...fb.rates } };
      source = fallback.name;
    }
    const doc = await FxRateModel.findOneAndUpdate(
      { date: got.date, source },
      { rates: got.rates, fetchedAt: now() },
      { upsert: true, new: true },
    ).lean<Doc>();
    return toSnapshot(doc!);
  }

  return {
    refresh,
    /** Cached for 6 hours; on provider failure serves the last snapshot marked stale. */
    async latest() {
      const cached = await newest();
      if (cached && now().getTime() - cached.fetchedAt.getTime() < CACHE_MS) return toSnapshot(cached);
      try {
        inflight ??= refresh().finally(() => (inflight = null));
        return await inflight;
      } catch (e) {
        console.warn('[fx] refresh failed:', (e as Error).message);
        if (cached) return toSnapshot(cached, true);
        throw new HttpError(503, 'Exchange rates are unavailable right now. Try again shortly.');
      }
    },
  };
}

/** Refreshes every day at 06:00 in the given time zone (default Asia/Dubai). */
export function scheduleDailyRefresh(service: RatesService, tz = 'Asia/Dubai', at = '06:00') {
  const schedule = () => {
    const now = new Date();
    let next = zonedToInstant(localDate(now, tz), at, tz);
    if (next <= now) next = zonedToInstant(addDays(localDate(now, tz), 1), at, tz);
    setTimeout(async () => {
      try {
        const s = await service.refresh();
        console.log(`[fx] daily refresh ok: ${s.source} ${s.date}`);
      } catch (e) {
        console.warn('[fx] daily refresh failed:', (e as Error).message);
      }
      schedule();
    }, next.getTime() - now.getTime()).unref();
  };
  schedule();
}
