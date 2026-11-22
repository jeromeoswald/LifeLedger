import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  accountBalances,
  approxMinor,
  budgetProgress,
  monthSpendByCategory,
  totalBalance,
  type Transaction,
} from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { useDisplayCurrency } from '@/stores/settings';
import { Card, P, Screen, SectionTitle } from '@/components/ui';
import { Chip } from '@/components/DateField';
import { Fab } from '@/components/Fab';
import { Money, RatesNote } from '@/components/wallet/Money';
import { formatDate, relativeDay } from '@/lib/format';
import { nowIso, removeRecord, saveRecord } from '@/lib/records';
import { useToday } from '@/lib/work';
import { ACCOUNT_ICONS, useAccounts, useCategories, useRates, useRecurring, useTransactions } from '@/lib/wallet';

const BAR = { ok: 'bg-brand', warn: 'bg-amber-500', over: 'bg-red-600' } as const;
const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' } as const;

export default function Wallet() {
  const user = useAuth((s) => s.user)!;
  const display = useDisplayCurrency(user.baseCurrency);
  const today = useToday(user.timeZone);
  const { data: accounts = [], isLoading } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: recurring = [] } = useRecurring();
  const rates = useRates();
  const [filter, setFilter] = useState<string | null>(null);

  const balances = accountBalances(accounts, txs);
  const total = totalBalance(accounts, balances, display, rates.data);
  const shown = accounts.filter((a) => !a.deletedAt).sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt));
  const cats = new Map(categories.map((c) => [c.clientId, c]));
  const accName = new Map(accounts.map((a) => [a.clientId, a]));
  const spend = monthSpendByCategory(txs, categories, today.slice(0, 7), rates.data);
  const budgets = categories.filter((c) => !c.deletedAt && !c.archivedAt && c.monthlyBudgetMinor && c.budgetCurrency);
  const recent = txs
    .filter((t) => !filter || t.accountId === filter || t.toAccountId === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 40);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <Screen>
        <Card>
          <P className="text-sm">Total balance</P>
          {total.missing ? (
            <Text className="text-3xl font-bold text-slate-900 dark:text-white">—</Text>
          ) : (
            <Money minor={total.totalMinor} currency={display} approx={total.approx} className="text-3xl font-bold text-slate-900 dark:text-white" />
          )}
          <View className="mt-2">
            <RatesNote rates={rates.data} error={rates.isError} />
          </View>
        </Card>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/wallet-reports')}
          className="mb-2 min-h-12 flex-row items-center justify-between rounded-2xl bg-white px-4 dark:bg-slate-900"
        >
          <Text className="text-base text-slate-900 dark:text-white">📊 Reports & CSV export</Text>
          <Text className="text-slate-400">›</Text>
        </Pressable>

        <View className="flex-row items-center justify-between">
          <SectionTitle>Accounts</SectionTitle>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/account/[id]', params: { id: 'new' } })} className="min-h-11 justify-center">
            <Text className="font-semibold text-brand dark:text-brand-light">+ Add account</Text>
          </Pressable>
        </View>
        {isLoading ? <P>Loading…</P> : null}
        {!isLoading && !shown.length ? <P className="mb-3">No accounts yet. Add your cash, bank and card accounts.</P> : null}
        {shown.map((a) => {
          const bal = balances.get(a.clientId) ?? 0;
          const conv = a.currency !== display ? approxMinor(bal, a.currency, display, rates.data) : null;
          return (
            <Pressable
              key={a.clientId}
              accessibilityRole="button"
              accessibilityLabel={`${a.name}, edit`}
              onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.clientId } })}
              className={`mb-2 min-h-14 flex-row items-center rounded-2xl bg-white px-4 py-3 dark:bg-slate-900 ${a.archivedAt ? 'opacity-50' : ''}`}
            >
              <Text className="mr-3 text-2xl">{ACCOUNT_ICONS[a.type]}</Text>
              <View className="flex-1">
                <Text className="text-base font-semibold text-slate-900 dark:text-white">{a.name}{a.archivedAt ? ' (archived)' : ''}</Text>
                <Text className="text-xs text-slate-500">{a.currency}</Text>
              </View>
              <View className="items-end">
                <Money minor={bal} currency={a.currency} className={`text-base font-semibold ${bal < 0 ? 'text-red-600' : 'text-slate-900 dark:text-white'}`} />
                {conv !== null ? <Money minor={conv} currency={display} approx className="text-xs text-slate-500" /> : null}
              </View>
            </Pressable>
          );
        })}

        <View className="flex-row items-center justify-between">
          <SectionTitle>Budgets · {formatDate(`${today.slice(0, 7)}-01`, { month: 'long' })}</SectionTitle>
          <Pressable accessibilityRole="button" onPress={() => router.push('/categories')} className="min-h-11 justify-center">
            <Text className="font-semibold text-brand dark:text-brand-light">Categories</Text>
          </Pressable>
        </View>
        <Card>
          {budgets.length ? (
            budgets.map((c) => {
              const spent = spend.get(c.clientId) ?? 0;
              const p = budgetProgress(spent, c.monthlyBudgetMinor!);
              return (
                <View key={c.clientId} className="mb-3" accessibilityLabel={`${c.name}: ${p.pct}% of budget used`}>
                  <View className="flex-row justify-between">
                    <Text className="text-slate-900 dark:text-white">{c.icon} {c.name}</Text>
                    <Text className={p.level === 'over' ? 'font-semibold text-red-600' : p.level === 'warn' ? 'font-semibold text-amber-600' : 'text-slate-500'}>
                      {p.pct}%{p.level === 'over' ? ' · over' : ''}
                    </Text>
                  </View>
                  <View className="my-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    <View className={`h-2 rounded-full ${BAR[p.level]}`} style={{ width: `${Math.min(100, p.pct)}%` }} />
                  </View>
                  <View className="flex-row">
                    <Money minor={spent} currency={c.budgetCurrency!} className="text-xs text-slate-500" />
                    <Text className="text-xs text-slate-500"> of </Text>
                    <Money minor={c.monthlyBudgetMinor!} currency={c.budgetCurrency!} className="text-xs text-slate-500" />
                  </View>
                </View>
              );
            })
          ) : (
            <P>No budgets yet. Set a monthly budget on a category.</P>
          )}
        </Card>

        {recurring.some((r) => !r.deletedAt) ? (
          <>
            <SectionTitle>Repeating</SectionTitle>
            {recurring.filter((r) => !r.deletedAt).map((r) => (
              <View key={r.clientId} className="mb-2 flex-row items-center rounded-2xl bg-white px-4 py-2 dark:bg-slate-900">
                <View className="flex-1">
                  <Text className="text-slate-900 dark:text-white">
                    {r.template.note || cats.get(r.template.categoryId ?? '')?.name || r.template.type} · {FREQ_LABEL[r.recurrence.freq]}
                  </Text>
                  <Text className="text-xs text-slate-500">{r.pausedAt ? 'Paused' : `Next: ${relativeDay(r.nextDate, today)}`}</Text>
                </View>
                <Money minor={r.template.amountMinor} currency={r.template.currency} className="mr-2 text-sm text-slate-900 dark:text-white" />
                <Pressable accessibilityRole="button" onPress={() => void saveRecord('recurring', { ...r, pausedAt: r.pausedAt ? null : nowIso() })} className="h-11 justify-center px-2">
                  <Text className="text-brand dark:text-brand-light">{r.pausedAt ? 'Resume' : 'Pause'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Stop repeating" onPress={() => void removeRecord('recurring', r.clientId)} className="h-11 justify-center px-2">
                  <Text className="text-red-600">Stop</Text>
                </Pressable>
              </View>
            ))}
          </>
        ) : null}

        <SectionTitle>Recent transactions</SectionTitle>
        {shown.length > 1 ? (
          <View className="mb-3 flex-row flex-wrap gap-2">
            <Chip text="All accounts" selected={!filter} onPress={() => setFilter(null)} />
            {shown.filter((a) => !a.archivedAt).map((a) => (
              <Chip key={a.clientId} text={a.name} selected={filter === a.clientId} onPress={() => setFilter(a.clientId)} />
            ))}
          </View>
        ) : null}
        {recent.length ? (
          recent.map((t, i) => (
            <View key={t.clientId}>
              {i === 0 || recent[i - 1]!.date !== t.date ? (
                <Text className="mb-1 mt-2 text-xs font-semibold text-slate-500">{relativeDay(t.date, today)}</Text>
              ) : null}
              <TxRow t={t} label={txLabel(t, cats, accName)} display={display} rates={rates.data} />
            </View>
          ))
        ) : (
          <P>No transactions yet. Tap + to add one.</P>
        )}
        <View className="h-20" />
      </Screen>
      <Fab label="Add transaction" onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: 'new' } })} />
    </View>
  );
}

function txLabel(t: Transaction, cats: Map<string, { name: string; icon: string }>, accs: Map<string, { name: string }>) {
  if (t.type === 'transfer') return `↔ ${accs.get(t.accountId)?.name ?? '?'} → ${accs.get(t.toAccountId ?? '')?.name ?? '?'}`;
  const c = cats.get(t.categoryId ?? '');
  return c ? `${c.icon} ${c.name}` : t.type === 'income' ? 'Income' : 'Expense';
}

function TxRow({ t, label, display, rates }: { t: Transaction; label: string; display: string; rates: Parameters<typeof approxMinor>[3] }) {
  const sign = t.type === 'expense' ? -1 : 1;
  const conv = t.currency !== display ? approxMinor(t.amountMinor, t.currency, display, rates) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${t.note ? `, ${t.note}` : ''}. Edit`}
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.clientId } })}
      className="mb-2 min-h-14 flex-row items-center rounded-2xl bg-white px-4 py-2 dark:bg-slate-900"
    >
      <View className="flex-1">
        <Text className="text-base text-slate-900 dark:text-white">{label}</Text>
        {t.note ? <Text numberOfLines={1} className="text-xs text-slate-500">{t.note}</Text> : null}
      </View>
      <View className="items-end">
        <Money
          minor={t.type === 'transfer' ? t.amountMinor : sign * t.amountMinor}
          currency={t.currency}
          signed={t.type !== 'transfer'}
          className={`text-base font-semibold ${t.type === 'income' ? 'text-teal-600 dark:text-teal-400' : 'text-slate-900 dark:text-white'}`}
        />
        {t.type === 'transfer' && t.toAmountMinor && t.toCurrency && t.toCurrency !== t.currency ? (
          <Money minor={t.toAmountMinor} currency={t.toCurrency} className="text-xs text-slate-500" />
        ) : conv !== null ? (
          <Money minor={conv} currency={display} approx className="text-xs text-slate-500" />
        ) : null}
      </View>
    </Pressable>
  );
}
