import { convertMinor, crossRate, type RatesSnapshot } from './fx';
import { nextDueDate } from './work';
import { addMonths } from './dates';
import { fromMinor } from './money';
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

// ---------- reports ----------

/** A transaction in `base`: its frozen base amount when the base matches, else the latest rate (approx). */
function inBase(t: Transaction, base: string, rates: RatesSnapshot | undefined): { v: number; approx: boolean } {
  if (t.baseCurrency === base) return { v: t.amountBaseMinor, approx: false };
  return { v: approxMinor(t.amountMinor, t.currency, base, rates) ?? 0, approx: true };
}

/** Income vs expense, spending by category and top expenses for one month ('YYYY-MM'). Transfers are excluded. */
export function monthReport(txs: Transaction[], categories: Category[], month: string, base: string, rates: RatesSnapshot | undefined, top = 5) {
  const cats = new Map(categories.map((c) => [c.clientId, c]));
  let income = 0;
  let expense = 0;
  let approx = false;
  const byCat = new Map<string, number>();
  const expenses: { t: Transaction; v: number }[] = [];
  for (const t of live(txs)) {
    if (!t.date.startsWith(month) || t.type === 'transfer') continue;
    const { v, approx: a } = inBase(t, base, rates);
    approx ||= a;
    if (t.type === 'income') income += v;
    else {
      expense += v;
      const key = t.categoryId && cats.has(t.categoryId) ? t.categoryId : '';
      byCat.set(key, (byCat.get(key) ?? 0) + v);
      expenses.push({ t, v });
    }
  }
  return {
    income,
    expense,
    net: income - expense,
    approx,
    byCategory: [...byCat]
      .map(([id, amount]) => ({ categoryId: id || null, name: cats.get(id)?.name ?? 'Uncategorised', icon: cats.get(id)?.icon ?? '', amount }))
      .sort((a, b) => b.amount - a.amount),
    topExpenses: expenses.sort((a, b) => b.v - a.v).slice(0, top).map((e) => ({ ...e.t, baseAmount: e.v })),
  };
}

/** Income, expense and net for the `count` months ending with `endMonth`, oldest first. */
export function netTrend(txs: Transaction[], endMonth: string, count: number, base: string, rates: RatesSnapshot | undefined) {
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(`${endMonth}-01`, i - count + 1, 1).slice(0, 7);
    const r = monthReport(txs, [], month, base, rates, 0);
    return { month, income: r.income, expense: r.expense, net: r.net };
  });
}

// ---------- CSV ----------

/** Quotes a cell when needed; text starting with = + - @ is prefixed with ' so spreadsheets don't run it as a formula. */
export function csvCell(v: string | number | null | undefined, text = false): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** All transactions as CSV (Excel-friendly: UTF-8 BOM, CRLF). Amounts are plain decimals in each currency. */
export function transactionsCsv(txs: Transaction[], accounts: Account[], categories: Category[]): string {
  const acc = new Map(accounts.map((a) => [a.clientId, a.name]));
  const cat = new Map(categories.map((c) => [c.clientId, c.name]));
  const header = [
    'date', 'type', 'account', 'amount', 'currency', 'category', 'note', 'to_account', 'to_amount', 'to_currency',
    'effective_rate', 'base_currency', 'amount_base', 'fx_rate_to_base', 'rate_date', 'rate_source',
  ];
  const rows = live(txs)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((t) =>
      [
        csvCell(t.date),
        csvCell(t.type),
        csvCell(acc.get(t.accountId) ?? '', true),
        csvCell(fromMinor(t.amountMinor, t.currency)),
        csvCell(t.currency),
        csvCell(t.categoryId ? (cat.get(t.categoryId) ?? '') : '', true),
        csvCell(t.note, true),
        csvCell(t.toAccountId ? (acc.get(t.toAccountId) ?? '') : '', true),
        csvCell(t.toAmountMinor !== null && t.toCurrency ? fromMinor(t.toAmountMinor, t.toCurrency) : ''),
        csvCell(t.toCurrency),
        csvCell(t.effectiveRate),
        csvCell(t.baseCurrency),
        csvCell(fromMinor(t.amountBaseMinor, t.baseCurrency)),
        csvCell(t.fxRateToBase),
        csvCell(t.rateDate),
        csvCell(t.rateSource, true),
      ].join(','),
    );
  return '﻿' + [header.join(','), ...rows].join('\r\n') + '\r\n';
}
