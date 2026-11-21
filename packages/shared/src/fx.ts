import Decimal from 'decimal.js';
import { getCurrency } from './currencies';

/** A rates snapshot: 1 USD = rates[code] units of `code`. Values are decimal strings. */
export interface RatesSnapshot {
  base: 'USD';
  /** date the provider's rates are for (YYYY-MM-DD) */
  date: string;
  fetchedAt: string;
  source: string;
  rates: Record<string, string>;
  /** true when the server couldn't refresh and is serving an older snapshot */
  stale?: boolean;
}

export const EXCHANGE_RATE_API_ATTRIBUTION = { text: 'Rates By Exchange Rate API', url: 'https://www.exchangerate-api.com' };

const SIG = 12; // significant digits kept for stored rates

/** rate(A→B) = rate(USD→B) / rate(USD→A), as a decimal string. Throws if a currency is missing. */
export function crossRate(snapshot: Pick<RatesSnapshot, 'rates'>, from: string, to: string): string {
  if (from === to) return '1';
  const a = snapshot.rates[from];
  const b = snapshot.rates[to];
  if (!a || !b) throw new Error(`No exchange rate for ${!a ? from : to}`);
  return new Decimal(b).div(a).toSignificantDigits(SIG).toString();
}

/** Converts integer minor units with a decimal rate; rounds half-up to the target currency's digits. */
export function convertMinor(amountMinor: number, from: string, to: string, rate: string): number {
  const fd = getCurrency(from).digits;
  const td = getCurrency(to).digits;
  const major = new Decimal(amountMinor).div(new Decimal(10).pow(fd)).times(rate);
  return major.times(new Decimal(10).pow(td)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** to/from in major units, e.g. 100 AED → 2,270 INR gives "22.7". */
export function effectiveRate(fromMinor: number, from: string, toMinor: number, to: string): string {
  if (fromMinor === 0) return '0';
  const f = new Decimal(fromMinor).div(new Decimal(10).pow(getCurrency(from).digits));
  const t = new Decimal(toMinor).div(new Decimal(10).pow(getCurrency(to).digits));
  return t.div(f).toSignificantDigits(SIG).toString();
}

/** Display a rate like "1 AED = 25.4234 INR" with sensible precision. */
export const formatRate = (rate: string, digits = 6) => new Decimal(rate).toSignificantDigits(digits).toString();

export type BudgetLevel = 'ok' | 'warn' | 'over';

/** Budget use: warn from 80%, over from 100%. pct is a whole-number percentage (floored). */
export function budgetProgress(spentMinor: number, budgetMinor: number): { pct: number; level: BudgetLevel } {
  if (budgetMinor <= 0) return { pct: 0, level: 'ok' };
  const pct = new Decimal(spentMinor).times(100).div(budgetMinor).floor().toNumber();
  return { pct, level: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok' };
}

/** Which alert threshold (80 or 100) a change crosses, if any; the higher one wins. */
export function crossedBudgetThreshold(beforeMinor: number, afterMinor: number, budgetMinor: number): 80 | 100 | null {
  if (budgetMinor <= 0) return null;
  const before = budgetProgress(beforeMinor, budgetMinor).pct;
  const after = budgetProgress(afterMinor, budgetMinor).pct;
  if (before < 100 && after >= 100) return 100;
  if (before < 80 && after >= 80) return 80;
  return null;
}
