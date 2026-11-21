import { convertMinor, crossRate, type RatesSnapshot } from './fx';
import { nextDueDate } from './work';
import type { Account, Category, Recurring, Transaction } from './schemas/wallet';

const live = <T extends { deletedAt: string | null }>(l: T[]) => l.filter((x) => !x.deletedAt);

/** Balance per account in its own currency (minor units): opening ± every transaction. */
export function accountBalances(accounts: Account[], txs: Transaction[]): Map<string, number> {
  const bal = new Map(live(accounts).map((a) => [a.clientId, a.openingBalanceMinor]));
  const add = (id: string | null, delta: number) => {
    if (id && bal.has(id)) bal.set(id, bal.get(id)! + delta);
  };
  for (const t of live(txs)) {
    if (t.type === 'income') add(t.accountId, t.accountAmountMinor);
    else if (t.type === 'expense') add(t.accountId, -t.accountAmountMinor);
    else {
      add(t.accountId, -t.accountAmountMinor);
      add(t.toAccountId, t.toAmountMinor ?? 0);
    }
  }
  return bal;
}

/**
 * Converts with the LATEST rates for display ("approx.").
 * Returns null when a rate is missing, so callers can show "—" instead of a wrong number.
 */
export function approxMinor(amountMinor: number, from: string, to: string, rates: RatesSnapshot | undefined): number | null {
  if (from === to) return amountMinor;
  if (!rates) return null;
  try {
    return convertMinor(amountMinor, from, to, crossRate(rates, from, to));
  } catch {
    return null;
  }
}

/** Sum of account balances in one display currency. `approx` is true if any conversion was needed. */
export function totalBalance(accounts: Account[], balances: Map<string, number>, display: string, rates: RatesSnapshot | undefined) {
  let total = 0;
  let approx = false;
  let missing = false;
  for (const a of live(accounts).filter((x) => !x.archivedAt)) {
    const v = approxMinor(balances.get(a.clientId) ?? 0, a.currency, display, rates);
    if (a.currency !== display) approx = true;
    if (v === null) missing = true;
    else total += v;
  }
  return { totalMinor: total, approx, missing };
}

/**
 * Expense spending per category for one month, in each category's budget currency.
 * Uses the frozen base amount when the base matches the budget currency, else latest rates (approx).
 */
export function monthSpendByCategory(txs: Transaction[], categories: Category[], month: string, rates: RatesSnapshot | undefined) {
  const out = new Map<string, number>();
  const cats = new Map(live(categories).map((c) => [c.clientId, c]));
  for (const t of live(txs)) {
    if (t.type !== 'expense' || !t.categoryId || !t.date.startsWith(month)) continue;
    const cat = cats.get(t.categoryId);
    if (!cat) continue;
    const cur = cat.budgetCurrency ?? t.baseCurrency;
    const v = t.baseCurrency === cur ? t.amountBaseMinor : approxMinor(t.amountMinor, t.currency, cur, rates);
    if (v !== null) out.set(cat.clientId, (out.get(cat.clientId) ?? 0) + v);
  }
  return out;
}

/** Dates on which a recurring entry is due, up to and including `today` (capped to avoid runaway loops). */
export function dueOccurrences(r: Pick<Recurring, 'nextDate' | 'recurrence' | 'pausedAt' | 'deletedAt'>, today: string, max = 60): { dates: string[]; nextDate: string } {
  const dates: string[] = [];
  let d = r.nextDate;
  if (r.pausedAt || r.deletedAt) return { dates, nextDate: d };
  while (d <= today && dates.length < max) {
    dates.push(d);
    d = nextDueDate(d, r.recurrence);
  }
  return { dates, nextDate: d };
}
