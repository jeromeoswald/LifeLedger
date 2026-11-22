import { Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import {
  convertMinor,
  crossedBudgetThreshold,
  crossRate,
  dueOccurrences,
  effectiveRate,
  localDate,
  monthSpendByCategory,
  type Account,
  type Category,
  type RatesSnapshot,
  type Recurring,
  type Transaction,
} from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { useToast } from '@/stores/toast';
import { ApiError, api } from './api';
import { localStore } from './store/localStore';
import { getCached, newBase, saveRecord, useList } from './records';
import { queryClient } from './queryClient';

export const useAccounts = () => useList<Account>('accounts');
export const useCategories = () => useList<Category>('categories');
export const useTransactions = () => useList<Transaction>('transactions');
export const useRecurring = () => useList<Recurring>('recurring');

type Snapshot = RatesSnapshot & { attribution: { text: string; url: string } };

/** Latest USD-based rates from our API (which caches the providers for 6h). */
export function useRates() {
  const signedIn = useAuth((s) => s.status === 'signedIn');
  return useQuery({
    queryKey: ['fx'],
    // Offline: the last saved snapshot, marked stale so it reads "Rates as of <date> (offline copy)".
    queryFn: async () => {
      try {
        const fresh = await api<Snapshot>('/fx/latest');
        await localStore.setMeta('fx', JSON.stringify(fresh));
        return fresh;
      } catch (e) {
        const saved = await localStore.getMeta('fx');
        if (e instanceof ApiError && e.status === 0 && saved) return { ...(JSON.parse(saved) as Snapshot), stale: true };
        throw e;
      }
    },
    enabled: signedIn,
    staleTime: 60 * 60 * 1000,
  });
}

export interface TxDraft {
  type: Transaction['type'];
  date: string;
  account: Account;
  amountMinor: number;
  currency: string;
  categoryId: string | null;
  note: string;
  toAccount?: Account | null;
  toAmountMinor?: number | null;
  recurringId?: string | null;
}

/**
 * Builds a transaction with its frozen base-currency conversion. When editing and the amount and
 * currency didn't change, the original rate is kept, so history never moves with the market.
 */
export function buildTransaction(
  d: TxDraft,
  rates: RatesSnapshot | undefined,
  baseCurrency: string,
  existing?: Transaction,
  /** fixed id for a new record (recurring occurrences) */
  id?: string,
): Transaction {
  const keepRate = existing && existing.amountMinor === d.amountMinor && existing.currency === d.currency && existing.baseCurrency === baseCurrency;
  const needRate = (from: string, to: string) => {
    if (from === to) return '1';
    if (!rates) throw new Error('Exchange rates are not loaded yet. Check your connection and try again.');
    return crossRate(rates, from, to);
  };
  const fxRateToBase = keepRate ? existing.fxRateToBase : needRate(d.currency, baseCurrency);
  const accountAmountMinor =
    d.type === 'transfer' || d.currency === d.account.currency
      ? d.amountMinor
      : keepRate && existing.accountId === d.account.clientId
        ? existing.accountAmountMinor
        : convertMinor(d.amountMinor, d.currency, d.account.currency, needRate(d.currency, d.account.currency));

  const transfer = d.type === 'transfer' && d.toAccount && d.toAmountMinor;
  const tx: Transaction = {
    ...(existing ?? { ...newBase(), ...(id ? { clientId: id } : {}) }),
    type: d.type,
    date: d.date,
    accountId: d.account.clientId,
    amountMinor: d.amountMinor,
    currency: d.currency,
    accountAmountMinor,
    categoryId: d.type === 'transfer' ? null : d.categoryId,
    note: d.note.trim(),
    toAccountId: transfer ? d.toAccount!.clientId : null,
    toAmountMinor: transfer ? d.toAmountMinor! : null,
    toCurrency: transfer ? d.toAccount!.currency : null,
    effectiveRate: null,
    baseCurrency,
    fxRateToBase,
    amountBaseMinor: convertMinor(d.amountMinor, d.currency, baseCurrency, fxRateToBase),
    rateDate: keepRate ? existing.rateDate : (rates?.date ?? d.date),
    rateSource: keepRate ? existing.rateSource : d.currency === baseCurrency ? 'same-currency' : (rates?.source ?? 'unknown'),
    recurringId: d.recurringId ?? existing?.recurringId ?? null,
  };
  // computed in the schema's own terms, so the server's check always agrees
  if (transfer) tx.effectiveRate = effectiveRate(tx.accountAmountMinor, tx.currency, tx.toAmountMinor!, tx.toCurrency!);
  return tx;
}

/** Saves, then raises an alert if this expense pushed its category past 80% or 100% of budget. */
export async function saveTransaction(tx: Transaction, rates: RatesSnapshot | undefined) {
  const month = tx.date.slice(0, 7);
  const cats = getCached<Category>('categories');
  const before = monthSpendByCategory(getCached<Transaction>('transactions'), cats, month, rates);
  const ok = await saveRecord('transactions', tx);
  if (!ok || tx.type !== 'expense' || !tx.categoryId) return ok;
  const cat = cats.find((c) => c.clientId === tx.categoryId);
  if (!cat?.monthlyBudgetMinor) return ok;
  const after = monthSpendByCategory(getCached<Transaction>('transactions'), cats, month, rates);
  const hit = crossedBudgetThreshold(before.get(cat.clientId) ?? 0, after.get(cat.clientId) ?? 0, cat.monthlyBudgetMinor);  if (hit) await budgetAlert(cat, hit);
  return ok;
}

async function budgetAlert(cat: Category, pct: 80 | 100) {
  const msg = pct === 100 ? `${cat.icon} ${cat.name}: budget used up for this month` : `${cat.icon} ${cat.name}: 80% of this month's budget used`;
  useToast.getState().show(msg);
  if (Platform.OS === 'web') return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await Notifications.scheduleNotificationAsync({ content: { title: 'Budget alert', body: msg, sound: true }, trigger: null });
}

/** Same recurring rule + date → same UUID on every device, so a due entry is never posted twice. */
async function occurrenceId(recurringId: string, date: string) {
  const h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${recurringId}:${date}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

let posting = false;
/** Creates any due recurring transactions (on app open / when data loads) and moves each rule's next date. */
export async function postDueRecurring(tz: string, baseCurrency: string, rates: RatesSnapshot | undefined) {
  if (posting) return;
  posting = true;
  try {
    const today = localDate(new Date(), tz);
    const accounts = getCached<Account>('accounts');
    const existing = new Set(getCached<Transaction>('transactions').map((t) => t.clientId));
    for (const r of getCached<Recurring>('recurring')) {
      const { dates, nextDate } = dueOccurrences(r, today);
      if (!dates.length) continue;
      const account = accounts.find((a) => a.clientId === r.template.accountId);
      const toAccount = accounts.find((a) => a.clientId === r.template.toAccountId) ?? null;
      if (!account) continue;
      for (const date of dates) {
        const id = await occurrenceId(r.clientId, date);
        if (existing.has(id)) continue;
        const tx = buildTransaction(
          {
            type: r.template.type,
            date,
            account,
            amountMinor: r.template.amountMinor,
            currency: r.template.currency,
            categoryId: r.template.categoryId,
            note: r.template.note,
            toAccount,
            toAmountMinor: r.template.toAmountMinor,
            recurringId: r.clientId,
          },
          rates,
          baseCurrency,
          undefined,
          id,
        );
        await saveTransaction(tx, rates);
      }
      await saveRecord('recurring', { ...r, nextDate });
    }
  } catch (e) {
    console.warn('[recurring]', e);
  } finally {
    posting = false;
  }
}

export const ACCOUNT_ICONS = { cash: '💵', bank: '🏦', card: '💳', savings: '🐷' } as const;

/** Refetch rates now (pull-to-refresh / retry). */
export const refreshRates = () => queryClient.invalidateQueries({ queryKey: ['fx'] });
