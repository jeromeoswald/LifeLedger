import { describe, expect, it } from 'vitest';
import { budgetProgress, convertMinor, crossedBudgetThreshold, crossRate, effectiveRate, type RatesSnapshot } from './fx';
import { accountBalances, approxMinor, csvCell, dueOccurrences, monthReport, monthSpendByCategory, netTrend, totalBalance, transactionsCsv } from './wallet';
import { fromMinor } from './money';
import { accountSchema, categorySchema, transactionSchema, type Account, type Category, type Transaction } from './schemas/wallet';

const T0 = '2026-11-01T00:00:00.000Z';
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const base = () => ({ clientId: uuid(), createdAt: T0, updatedAt: T0 });

// 1 USD = …
const RATES: RatesSnapshot = {
  base: 'USD',
  date: '2026-11-20',
  fetchedAt: T0,
  source: 'test',
  rates: { USD: '1', AED: '3.6725', INR: '93.372746', JPY: '154.32', KWD: '0.30712', EUR: '0.9213' },
};

describe('cross rates', () => {
  it('computes A→B through USD', () => {
    expect(crossRate(RATES, 'AED', 'INR')).toBe('25.4248457454'); // 93.372746 / 3.6725
    expect(crossRate(RATES, 'USD', 'AED')).toBe('3.6725');
    expect(crossRate(RATES, 'AED', 'AED')).toBe('1');
  });
  it('round-trips within rounding', () => {
    const there = convertMinor(100_00, 'AED', 'INR', crossRate(RATES, 'AED', 'INR'));
    const back = convertMinor(there, 'INR', 'AED', crossRate(RATES, 'INR', 'AED'));
    expect(Math.abs(back - 100_00)).toBeLessThanOrEqual(1);
  });
  it('throws for an unknown currency instead of guessing', () => {
    expect(() => crossRate(RATES, 'AED', 'XAF')).toThrow(/XAF/);
    expect(approxMinor(100, 'AED', 'XAF', RATES)).toBeNull();
  });
});

describe('convertMinor rounding per currency', () => {
  it('rounds to the target minor digits, half-up', () => {
    expect(convertMinor(100_00, 'AED', 'INR', '25.4248457454')).toBe(2542_48); // 2542.484… INR
    expect(convertMinor(100_00, 'USD', 'JPY', '154.325')).toBe(15433); // JPY has 0 digits: 15432.5 → 15433
    expect(convertMinor(100_00, 'USD', 'KWD', '0.30712')).toBe(30_712); // KWD has 3 digits
    expect(convertMinor(1, 'AED', 'USD', '0.272294')).toBe(0); // 0.0027 USD rounds to 0 cents
    expect(convertMinor(1500, 'JPY', 'AED', '0.0237973')).toBe(35_70); // 1500 JPY → 35.69595 AED
  });
  it('never uses float maths', () => {
    expect(convertMinor(10, 'USD', 'USD', '1.1')).toBe(11); // 0.1 * 1.1 in floats = 0.11000000000000001
  });
  it('effective rate of a transfer', () => {
    expect(effectiveRate(100_00, 'AED', 2540_00, 'INR')).toBe('25.4');
    expect(effectiveRate(1000, 'JPY', 6_50, 'USD')).toBe('0.0065');
  });
});

describe('budget %', () => {
  it('levels at 80% and 100%', () => {
    expect(budgetProgress(0, 1000_00)).toEqual({ pct: 0, level: 'ok' });
    expect(budgetProgress(799_99, 1000_00)).toEqual({ pct: 79, level: 'ok' });
    expect(budgetProgress(800_00, 1000_00)).toEqual({ pct: 80, level: 'warn' });
    expect(budgetProgress(1000_00, 1000_00)).toEqual({ pct: 100, level: 'over' });
    expect(budgetProgress(1534_00, 1000_00)).toEqual({ pct: 153, level: 'over' });
    expect(budgetProgress(5, 0).level).toBe('ok');
  });
  it('fires each alert once, when crossing', () => {
    expect(crossedBudgetThreshold(700_00, 850_00, 1000_00)).toBe(80);
    expect(crossedBudgetThreshold(850_00, 900_00, 1000_00)).toBeNull();
    expect(crossedBudgetThreshold(900_00, 1000_00, 1000_00)).toBe(100);
    expect(crossedBudgetThreshold(100_00, 1200_00, 1000_00)).toBe(100); // jumps past both: report the higher
    expect(crossedBudgetThreshold(1100_00, 1200_00, 1000_00)).toBeNull();
  });
});

function account(p: Partial<Account>): Account {
  return accountSchema.parse({ ...base(), name: 'A', type: 'bank', currency: 'AED', ...p });
}
function tx(p: Partial<Transaction> & Pick<Transaction, 'type' | 'accountId' | 'amountMinor' | 'currency'>): Transaction {
  const fx = p.currency === 'AED' ? '1' : crossRate(RATES, p.currency, 'AED');
  return transactionSchema.parse({
    ...base(),
    date: '2026-11-20',
    accountAmountMinor: p.amountMinor,
    baseCurrency: 'AED',
    fxRateToBase: fx,
    amountBaseMinor: convertMinor(p.amountMinor, p.currency, 'AED', fx),
    rateDate: '2026-11-20',
    rateSource: 'test',
    ...p,
  });
}

describe('balances', () => {
  const aed = account({ name: 'Bank AED', openingBalanceMinor: 10_000_00 });
  const inr = account({ name: 'Bank INR', currency: 'INR', openingBalanceMinor: 50_000_00 });
  const txs = [
    tx({ type: 'income', accountId: aed.clientId, amountMinor: 5000_00, currency: 'AED' }),
    tx({ type: 'expense', accountId: aed.clientId, amountMinor: 250_00, currency: 'AED' }),
    // paid 20 USD from the AED account: the balance moves by the AED equivalent
    tx({ type: 'expense', accountId: aed.clientId, amountMinor: 20_00, currency: 'USD', accountAmountMinor: 73_45 }),
    tx({
      type: 'transfer',
      accountId: aed.clientId,
      amountMinor: 1000_00,
      currency: 'AED',
      toAccountId: inr.clientId,
      toAmountMinor: 25_400_00,
      toCurrency: 'INR',
      effectiveRate: '25.4',
    }),
  ];

  it('applies income, expenses and both sides of a transfer', () => {
    const b = accountBalances([aed, inr], txs);
    expect(b.get(aed.clientId)).toBe(10_000_00 + 5000_00 - 250_00 - 73_45 - 1000_00);
    expect(b.get(inr.clientId)).toBe(50_000_00 + 25_400_00);
  });

  it('totals in a display currency and flags it as approx', () => {
    const b = accountBalances([aed, inr], txs);
    const t = totalBalance([aed, inr], b, 'AED', RATES);
    expect(t.approx).toBe(true);
    expect(t.totalMinor).toBe(b.get(aed.clientId)! + convertMinor(75_400_00, 'INR', 'AED', crossRate(RATES, 'INR', 'AED')));
    expect(totalBalance([aed], b, 'AED', undefined)).toMatchObject({ approx: false, missing: false });
    expect(totalBalance([aed, inr], b, 'AED', undefined).missing).toBe(true);
  });

  it('transfer schema demands matching effective rate and base amount', () => {
    const good = txs[3]!;
    expect(transactionSchema.safeParse({ ...good, effectiveRate: '30' }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...good, amountBaseMinor: good.amountBaseMinor + 1 }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...good, toAccountId: good.accountId }).success).toBe(false);
  });
});

describe('month spend per category', () => {
  it('uses the frozen base amount and only that month', () => {
    const acc = account({});
    const food: Category = categorySchema.parse({ ...base(), name: 'Food', kind: 'expense', monthlyBudgetMinor: 1000_00, budgetCurrency: 'AED' });
    const spent = monthSpendByCategory(
      [
        tx({ type: 'expense', accountId: acc.clientId, amountMinor: 300_00, currency: 'AED', categoryId: food.clientId }),
        tx({ type: 'expense', accountId: acc.clientId, amountMinor: 50_00, currency: 'USD', accountAmountMinor: 183_63, categoryId: food.clientId }),
        tx({ type: 'expense', accountId: acc.clientId, amountMinor: 999_00, currency: 'AED', categoryId: food.clientId, date: '2026-10-31' }),
      ],
      [food],
      '2026-11',
      RATES,
    );
    expect(spent.get(food.clientId)).toBe(300_00 + convertMinor(50_00, 'USD', 'AED', '3.6725'));
  });
});

describe('recurring', () => {
  it('lists every missed occurrence up to today and the next date', () => {
    const r = { nextDate: '2026-09-30', recurrence: { freq: 'monthly' as const, interval: 1, weekdays: [], monthDay: 30 }, pausedAt: null, deletedAt: null };
    expect(dueOccurrences(r, '2026-11-22')).toEqual({ dates: ['2026-09-30', '2026-10-30'], nextDate: '2026-11-30' });
    expect(dueOccurrences({ ...r, pausedAt: T0 }, '2026-11-22').dates).toEqual([]);
  });
});

describe('wallet reports', () => {
  const acc = account({ name: 'Bank' });
  const inr = account({ name: 'Bank INR', currency: 'INR' });
  const food: Category = categorySchema.parse({ ...base(), name: 'Food', kind: 'expense', icon: '🍽️' });
  const txs = [
    tx({ type: 'income', accountId: acc.clientId, amountMinor: 10_000_00, currency: 'AED', date: '2026-11-01' }),
    tx({ type: 'expense', accountId: acc.clientId, amountMinor: 300_00, currency: 'AED', categoryId: food.clientId, date: '2026-11-05' }),
    tx({ type: 'expense', accountId: acc.clientId, amountMinor: 50_00, currency: 'USD', accountAmountMinor: 183_63, date: '2026-11-06' }),
    tx({ type: 'expense', accountId: acc.clientId, amountMinor: 2_000_00, currency: 'AED', categoryId: food.clientId, date: '2026-10-15' }),
    tx({ type: 'transfer', accountId: acc.clientId, amountMinor: 1_000_00, currency: 'AED', toAccountId: inr.clientId, toAmountMinor: 25_400_00, toCurrency: 'INR', effectiveRate: '25.4', date: '2026-11-07' }),
  ];

  it('month: income vs expense, by category, top expenses; transfers excluded', () => {
    const r = monthReport(txs, [food], '2026-11', 'AED', RATES);
    const usd = convertMinor(50_00, 'USD', 'AED', '3.6725');
    expect(r).toMatchObject({ income: 10_000_00, expense: 300_00 + usd, net: 10_000_00 - 300_00 - usd, approx: false });
    expect(r.byCategory).toEqual([
      { categoryId: food.clientId, name: 'Food', icon: '🍽️', amount: 300_00 },
      { categoryId: null, name: 'Uncategorised', icon: '', amount: usd },
    ]);
    expect(r.topExpenses.map((t) => t.baseAmount)).toEqual([300_00, usd]);
  });

  it('a base-currency change converts old entries with latest rates and flags approx', () => {
    const r = monthReport(txs, [food], '2026-11', 'INR', RATES);
    expect(r.approx).toBe(true);
    expect(r.income).toBe(convertMinor(10_000_00, 'AED', 'INR', crossRate(RATES, 'AED', 'INR')));
  });

  it('net trend runs back across a year boundary, oldest first', () => {
    const t = netTrend(txs, '2026-11', 3, 'AED', RATES);
    expect(t.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(t[1]).toEqual({ month: '2026-10', income: 0, expense: 2_000_00, net: -2_000_00 });
    expect(netTrend([], '2026-01', 2, 'AED', RATES).map((m) => m.month)).toEqual(['2025-12', '2026-01']);
  });
});

describe('CSV export', () => {
  it('escapes quotes, commas and newlines, and defuses formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('=HYPERLINK("x")', true)).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5', false)).toBe('-5'); // numbers stay numbers
    expect(csvCell(null)).toBe('');
  });

  it('exports every transaction with frozen FX fields', () => {
    const a = account({ name: 'Bank, main' });
    const t = tx({ type: 'expense', accountId: a.clientId, amountMinor: 1500, currency: 'JPY', accountAmountMinor: 35_70, note: '@lunch' });
    const csv = transactionsCsv([t], [a], []);
    expect(csv.startsWith('﻿date,type,account,amount,currency')).toBe(true);
    const row = csv.trim().split('\r\n')[1]!;
    expect(row).toBe(`2026-11-20,expense,"Bank, main",1500,JPY,,'@lunch,,,,,AED,${fromMinor(t.amountBaseMinor, 'AED')},${t.fxRateToBase},2026-11-20,test`);
  });
});
