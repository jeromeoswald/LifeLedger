import { z } from 'zod';

/** A source of USD-based rates. Values are decimal strings: 1 USD = rates[code]. */
export interface RateProvider {
  name: string;
  latest(): Promise<{ date: string; rates: Record<string, string> }>;
}

const TIMEOUT_MS = 10_000;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

const numberRates = z.record(z.string().regex(/^[A-Z]{3}$/), z.number().positive());
const toStrings = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]));

/** ExchangeRate-API open endpoint (no key, updates daily). Its terms require visible attribution. */
export function exchangeRateApi(url: string): RateProvider {
  const schema = z.object({ result: z.literal('success'), time_last_update_unix: z.number(), base_code: z.literal('USD'), rates: numberRates });
  return {
    name: 'exchangerate-api',
    async latest() {
      const j = schema.parse(await getJson(url));
      return { date: new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10), rates: toStrings(j.rates) };
    },
  };
}

/** Frankfurter (ECB data, ~30 currencies; no AED). Used as the fallback. */
export function frankfurter(baseUrl: string): RateProvider {
  const schema = z.object({ date: z.string(), base: z.literal('USD'), rates: numberRates });
  return {
    name: 'frankfurter',
    async latest() {
      const j = schema.parse(await getJson(`${baseUrl.replace(/\/$/, '')}/latest?base=USD`));
      return { date: j.date, rates: { ...toStrings(j.rates), USD: '1' } };
    },
  };
}
