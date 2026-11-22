import { useState } from 'react';
import { Text, View } from 'react-native';
import { addMonths, formatMoney, monthReport, netTrend, transactionsCsv } from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { Button, Card, P, Screen, SectionTitle } from '@/components/ui';
import { NavBtn } from '@/components/DateField';
import { Columns } from '@/components/Columns';
import { Money } from '@/components/wallet/Money';
import { CSV_MIME, shareFile } from '@/lib/export';
import { formatDate, formatMonth } from '@/lib/format';
import { useToday } from '@/lib/work';
import { useAccounts, useCategories, useRates, useTransactions } from '@/lib/wallet';
import { showError } from '@/stores/toast';

/** Monthly wallet report in the base currency (frozen amounts; "approx." only if the base changed since). */
export default function WalletReports() {
  const user = useAuth((s) => s.user)!;
  const base = user.baseCurrency;
  const today = useToday(user.timeZone);
  const [month, setMonth] = useState(today.slice(0, 7));
  const { data: txs = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const rates = useRates();

  const r = monthReport(txs, categories, month, base, rates.data);
  const trend = netTrend(txs, month, 6, base, rates.data);
  const maxCat = Math.max(1, ...r.byCategory.map((c) => c.amount));
  const accName = new Map(accounts.map((a) => [a.clientId, a.name]));
  const catOf = new Map(categories.map((c) => [c.clientId, c]));

  return (
    <Screen>
      <View className="mb-3 flex-row items-center justify-between">
        <NavBtn label="Previous month" text="‹" onPress={() => setMonth(addMonths(`${month}-01`, -1, 1).slice(0, 7))} />
        <Text className="text-lg font-semibold text-slate-900 dark:text-white">{formatMonth(`${month}-01`)}</Text>
        <NavBtn label="Next month" text="›" onPress={() => month < today.slice(0, 7) && setMonth(addMonths(`${month}-01`, 1, 1).slice(0, 7))} />
      </View>

      <SectionTitle>Income vs expense</SectionTitle>
      <View className="flex-row gap-3">
        <Card className="flex-1">
          <P className="text-sm">Income</P>
          <Money minor={r.income} currency={base} approx={r.approx} className="text-xl font-bold text-teal-600 dark:text-teal-400" />
        </Card>
        <Card className="flex-1">
          <P className="text-sm">Expense</P>
          <Money minor={r.expense} currency={base} approx={r.approx} className="text-xl font-bold text-slate-900 dark:text-white" />
        </Card>
      </View>
      <Card>
        <P className="text-sm">Net</P>
        <Money minor={r.net} currency={base} approx={r.approx} signed className={`text-2xl font-bold ${r.net < 0 ? 'text-red-600' : 'text-teal-600 dark:text-teal-400'}`} />
        {r.income + r.expense > 0 ? (
          <View className="mt-2 h-3 flex-row overflow-hidden rounded-full" accessibilityLabel="Income versus expense bar">
            <View className="bg-teal-500" style={{ flex: r.income }} />
            <View className="bg-slate-400 dark:bg-slate-600" style={{ flex: r.expense }} />
          </View>
        ) : null}
      </Card>

      <SectionTitle>Spending by category</SectionTitle>
      <Card>
        {r.byCategory.length ? (
          r.byCategory.map((c) => (
            <View key={c.categoryId ?? 'none'} className="mb-3" accessibilityLabel={`${c.name}: ${formatMoney(c.amount, base)}`}>
              <View className="flex-row justify-between">
                <Text className="text-slate-900 dark:text-white">{c.icon} {c.name}</Text>
                <Money minor={c.amount} currency={base} className="text-sm text-slate-600 dark:text-slate-300" />
              </View>
              <View className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <View className="h-2 rounded-full bg-brand" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
              </View>
            </View>
          ))
        ) : (
          <P>No expenses this month.</P>
        )}
      </Card>

      <SectionTitle>Net trend · last 6 months</SectionTitle>
      <Card>
        <Columns
          baseline="zero"
          values={trend.map((m) => m.net)}
          labels={trend.map((m) => formatDate(`${m.month}-01`, { month: 'short' }))}
          a11y={`Net per month: ${trend.map((m) => `${m.month} ${formatMoney(m.net, base)}`).join(', ')}`}
          height={120}
        />
      </Card>

      <SectionTitle>Top expenses</SectionTitle>
      <Card>
        {r.topExpenses.length ? (
          r.topExpenses.map((t) => (
            <View key={t.clientId} className="min-h-12 flex-row items-center justify-between border-b border-slate-100 py-1 dark:border-slate-800">
              <View className="flex-1">
                <Text className="text-slate-900 dark:text-white">{t.note || catOf.get(t.categoryId ?? '')?.name || 'Expense'}</Text>
                <Text className="text-xs text-slate-500">
                  {formatDate(t.date)} · {accName.get(t.accountId) ?? ''}
                  {t.currency !== base ? ` · ${formatMoney(t.amountMinor, t.currency)}` : ''}
                </Text>
              </View>
              <Money minor={t.baseAmount} currency={base} approx={t.baseCurrency !== base} className="font-semibold text-slate-900 dark:text-white" />
            </View>
          ))
        ) : (
          <P>No expenses this month.</P>
        )}
      </Card>

      <SectionTitle>Export</SectionTitle>
      <Button
        title={`Export all ${txs.filter((t) => !t.deletedAt).length} transactions (CSV)`}
        variant="secondary"
        onPress={() =>
          void shareFile(`lifeledger-transactions-${today}.csv`, transactionsCsv(txs, accounts, categories), CSV_MIME).catch(showError)
        }
      />
      <P className="mb-6 mt-2 text-xs">Includes each transaction's original currency and the exchange rate frozen when it was saved.</P>
    </Screen>
  );
}
