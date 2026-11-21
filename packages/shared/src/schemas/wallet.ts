import { z } from 'zod';
import Decimal from 'decimal.js';
import { currencyCode } from './auth';
import { dateStr, isoDateTime, recurrenceSchema, syncFields } from './work';
import { convertMinor, effectiveRate } from '../fx';

const minor = z.number().int().min(-1e15).max(1e15);
const positiveMinor = z.number().int().min(1, 'Enter an amount').max(1e15);
const rateStr = z.string().refine((s) => {
  try {
    return new Decimal(s).gt(0);
  } catch {
    return false;
  }
}, 'Invalid rate');

export const ACCOUNT_TYPES = ['cash', 'bank', 'card', 'savings'] as const;
export const TX_TYPES = ['expense', 'income', 'transfer'] as const;

export const accountSchema = z.object({
  ...syncFields,
  name: z.string().trim().min(1, 'Name the account').max(60),
  type: z.enum(ACCOUNT_TYPES),
  currency: currencyCode,
  /** starting balance in the account's currency (minor units; may be negative for cards) */
  openingBalanceMinor: minor.default(0),
  archivedAt: isoDateTime.nullable().default(null),
});

export const categorySchema = z.object({
  ...syncFields,
  name: z.string().trim().min(1, 'Name the category').max(40),
  kind: z.enum(['expense', 'income']),
  icon: z.string().max(8).default(''),
  /** monthly budget (expense categories), in budgetCurrency minor units */
  monthlyBudgetMinor: z.number().int().min(1).max(1e15).nullable().default(null),
  budgetCurrency: currencyCode.nullable().default(null),
  archivedAt: isoDateTime.nullable().default(null),
});

/**
 * A money movement. `amountMinor`/`currency` is what was paid (any ISO currency);
 * `accountAmountMinor` is the same amount in the account's currency (what the balance moves by).
 * Base-currency fields are frozen at save time so history never changes when rates move.
 */
export const transactionSchema = z
  .object({
    ...syncFields,
    type: z.enum(TX_TYPES),
    date: dateStr,
    accountId: z.uuid('Pick an account'),
    amountMinor: positiveMinor,
    currency: currencyCode,
    accountAmountMinor: positiveMinor,
    categoryId: z.uuid().nullable().default(null),
    note: z.string().trim().max(500).default(''),
    // transfers
    toAccountId: z.uuid().nullable().default(null),
    toAmountMinor: positiveMinor.nullable().default(null),
    toCurrency: currencyCode.nullable().default(null),
    effectiveRate: rateStr.nullable().default(null),
    // frozen conversion to the user's base currency
    baseCurrency: currencyCode,
    fxRateToBase: rateStr,
    amountBaseMinor: z.number().int().min(0).max(1e15),
    rateDate: dateStr,
    rateSource: z.string().max(40),
    recurringId: z.uuid().nullable().default(null),
  })
  .refine((t) => t.type !== 'transfer' || (t.toAccountId && t.toAmountMinor && t.toCurrency && t.effectiveRate), {
    message: 'Pick the account to transfer to',
    path: ['toAccountId'],
  })
  .refine((t) => t.type !== 'transfer' || t.toAccountId !== t.accountId, { message: 'Pick two different accounts', path: ['toAccountId'] })
  .refine((t) => amountBaseMatches(t), { message: 'Base amount does not match the stored rate', path: ['amountBaseMinor'] })
  .refine(
    (t) => t.type !== 'transfer' || !t.toAmountMinor || !t.toCurrency || !t.effectiveRate || t.effectiveRate === effectiveRate(t.accountAmountMinor, accountCurrencyOf(t), t.toAmountMinor, t.toCurrency),
    { message: 'Effective rate does not match the two amounts', path: ['effectiveRate'] },
  );

// A transfer's "from" side is in the account currency, which for transfers equals the paid currency.
const accountCurrencyOf = (t: { currency: string }) => t.currency;

function amountBaseMatches(t: { amountMinor: number; currency: string; baseCurrency: string; fxRateToBase: string; amountBaseMinor: number }) {
  try {
    return convertMinor(t.amountMinor, t.currency, t.baseCurrency, t.fxRateToBase) === t.amountBaseMinor;
  } catch {
    return false;
  }
}

/** A repeating transaction. The client creates each due occurrence with a deterministic id, so two devices never double-post. */
export const recurringSchema = z.object({
  ...syncFields,
  template: z.object({
    type: z.enum(TX_TYPES),
    accountId: z.uuid(),
    amountMinor: positiveMinor,
    currency: currencyCode,
    categoryId: z.uuid().nullable().default(null),
    note: z.string().trim().max(500).default(''),
    toAccountId: z.uuid().nullable().default(null),
    toAmountMinor: positiveMinor.nullable().default(null),
  }),
  recurrence: recurrenceSchema,
  /** next date an occurrence is due (local date) */
  nextDate: dateStr,
  pausedAt: isoDateTime.nullable().default(null),
});

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type TxType = (typeof TX_TYPES)[number];
export type Account = z.infer<typeof accountSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Recurring = z.infer<typeof recurringSchema>;
