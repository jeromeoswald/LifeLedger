import Decimal from 'decimal.js';
import { getCurrency } from './currencies';

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** "12.345" AED -> 1235 (half-up, away from zero). Input must be a plain decimal string. */
export function toMinor(amount: string, currency: string): number {
  const s = amount.trim();
  if (!DECIMAL_RE.test(s)) throw new Error(`Invalid amount: "${amount}"`);
  const { digits } = getCurrency(currency);
  const minor = new Decimal(s).times(new Decimal(10).pow(digits)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (!minor.abs().lte(Number.MAX_SAFE_INTEGER)) throw new Error('Amount too large');
  return minor.toNumber();
}

/** 1235 AED -> "12.35" (fixed digits, no grouping). */
export function fromMinor(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new Error(`Minor amount must be a safe integer: ${minor}`);
  const { digits } = getCurrency(currency);
  return new Decimal(minor).div(new Decimal(10).pow(digits)).toFixed(digits);
}

/** Locale display, e.g. "AED 1,234.50". */
export function formatMoney(minor: number, currency: string, locale = 'en-AE'): string {
  const { digits, code } = getCurrency(currency);
  // Intl takes a number; safe because fromMinor is exact and display-only.
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(fromMinor(minor, code)));
}
