import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { accountBalances, approxMinor, budgetProgress, groupToday, habitStats, monthSpendByCategory, totalBalance } from '@lifeledger/shared';
import { useDisplayCurrency } from '@/stores/settings';
import { Money } from '@/components/wallet/Money';
import { useAccounts, useCategories, useRates, useTransactions } from '@/lib/wallet';
import { HabitCard } from '@/components/habits/HabitCard';
import { useHabitEntries, useHabits } from '@/lib/habits';
import { useAuth } from '@/stores/auth';
import { Card, H1, P, Screen, SectionTitle } from '@/components/ui';
import { TaskRow } from '@/components/work/TaskRow';
import { TimerBar } from '@/components/work/TimerBar';
import { formatLongDate } from '@/lib/format';
import { runningSession, useSessions, useTasks, useToday } from '@/lib/work';

export default function Home() {
  const user = useAuth((s) => s.user);
  const tz = user?.timeZone ?? 'Asia/Dubai';
  const today = useToday(tz);
  const { data: tasks = [], isLoading } = useTasks();
  const { data: sessions } = useSessions();
  const { data: habits = [] } = useHabits();
  const { data: entries = [] } = useHabitEntries();
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: rates } = useRates();
  const display = useDisplayCurrency(user?.baseCurrency);
  if (!user) return null;
  const habitsDue = habits
    .filter((h) => !h.archivedAt)
    .map((h) => ({ h, s: habitStats(h, entries, new Date(), tz) }))
    .filter((x) => x.s.dueToday);

  const running = runningSession(sessions);
  const g = groupToday(tasks, today, tz);
  const open = [...g.overdue, ...g.today.filter((t) => t.status !== 'done')];
  const doneToday = g.today.length - g.today.filter((t) => t.status !== 'done').length;

  // Wallet summary, in the display currency (approx. when converted with the latest rates)
  const total = totalBalance(accounts, accountBalances(accounts, txs), display, rates);
  const spendByCat = monthSpendByCategory(txs, categories, today.slice(0, 7), rates);
  let approx = false;
  const toDisplay = (minor: number, ccy: string) => {
    if (ccy !== display) approx = true;
    return approxMinor(minor, ccy, display, rates) ?? 0;
  };
  const budgeted = categories.filter((c) => !c.deletedAt && !c.archivedAt && c.monthlyBudgetMinor && c.budgetCurrency);
  const month = {
    spent: budgeted.reduce((n, c) => n + toDisplay(spendByCat.get(c.clientId) ?? 0, c.budgetCurrency!), 0),
    budget: budgeted.reduce((n, c) => n + toDisplay(c.monthlyBudgetMinor!, c.budgetCurrency!), 0),
    approx: false,
  };
  month.approx = approx;
  const progress = budgetProgress(month.spent, month.budget);

  return (
    <Screen>
      <P>{formatLongDate(today)}</P>
      <H1>Hello 👋</H1>
      <TimerBar session={running} task={tasks.find((t) => t.clientId === running?.taskId)} />

      <SectionTitle>
        Today's tasks · {open.length} open{doneToday ? ` · ${doneToday} done` : ''}
        {g.overdue.length ? ` · ${g.overdue.length} overdue` : ''}
      </SectionTitle>
      {isLoading ? <P>Loading…</P> : null}
      {!isLoading && !open.length ? (
        <Card>
          <P>{doneToday ? 'All done for today 🎉' : 'Nothing due today.'}</P>
        </Card>
      ) : null}
      {open.slice(0, 6).map((t) => (
        <TaskRow key={t.clientId} task={t} today={today} tz={tz} running={t.clientId === running?.taskId} />
      ))}
      <Pressable accessibilityRole="link" onPress={() => router.push('/work')} className="min-h-11 justify-center">
        <Text className="font-semibold text-brand dark:text-brand-light">
          {open.length > 6 ? `See all ${open.length} in Work ›` : 'Open Work ›'}
        </Text>
      </Pressable>

      <SectionTitle>Habits to tick · {habitsDue.length}</SectionTitle>
      {habitsDue.length ? (
        habitsDue.map(({ h, s }) => <HabitCard key={h.clientId} habit={h} entries={entries} stats={s} compact />)
      ) : (
        <Card>
          <P>{habits.some((h) => !h.archivedAt) ? 'All habits ticked for today 🎉' : 'No habits yet. Add one in the Habits tab.'}</P>
        </Card>
      )}

      <Pressable accessibilityRole="link" accessibilityLabel="Open Wallet" onPress={() => router.push('/wallet')}>
        <SectionTitle>Total balance</SectionTitle>
        <Card>
          {total.missing ? (
            <Text className="text-3xl font-bold text-slate-900 dark:text-white">—</Text>
          ) : (
            <Money minor={total.totalMinor} currency={display} approx={total.approx} className="text-3xl font-bold text-slate-900 dark:text-white" />
          )}
          <P className="mt-1 text-sm">{accounts.filter((a) => !a.deletedAt && !a.archivedAt).length} accounts</P>
        </Card>

        <SectionTitle>This month: spent vs budget</SectionTitle>
        <Card>
          {month.budget ? (
            <>
              <View className="flex-row flex-wrap items-baseline">
                <Money minor={month.spent} currency={display} approx={month.approx} className="text-xl font-bold text-slate-900 dark:text-white" />
                <Text className="text-slate-500"> of </Text>
                <Money minor={month.budget} currency={display} approx={month.approx} className="text-base text-slate-600 dark:text-slate-300" />
              </View>
              <View className="my-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <View
                  className={`h-2 rounded-full ${progress.level === 'over' ? 'bg-red-600' : progress.level === 'warn' ? 'bg-amber-500' : 'bg-brand'}`}
                  style={{ width: `${Math.min(100, progress.pct)}%` }}
                />
              </View>
              <P className="text-sm">{progress.pct}% of budgeted categories used</P>
            </>
          ) : (
            <P>No budgets set. Add a monthly budget to a category in Wallet.</P>
          )}
        </Card>
      </Pressable>
    </Screen>
  );
}
