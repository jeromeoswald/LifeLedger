import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuth } from '@/stores/auth';
import { useAlarms } from '@/lib/alarms';
import { useTasks } from '@/lib/work';
import { useHabits } from '@/lib/habits';
import { postDueRecurring, useAccounts, useRates, useRecurring, useTransactions } from '@/lib/wallet';
import { Toast } from '@/components/Toast';

export default function AppLayout() {
  const user = useAuth((s) => s.user);
  const tz = user?.timeZone ?? 'Asia/Dubai';
  const { data: tasks } = useTasks();
  const { data: habits } = useHabits();
  useAlarms(tasks, habits, tz);

  // Post any due repeating transactions once the wallet data (and rates) are loaded.
  const accounts = useAccounts();
  const recurring = useRecurring();
  const txs = useTransactions();
  const rates = useRates();
  const ready = accounts.isSuccess && recurring.isSuccess && txs.isSuccess && !rates.isLoading;
  useEffect(() => {
    if (ready && user) void postDueRecurring(tz, user.baseCurrency, rates.data);
  }, [ready, recurring.data, user, tz, rates.data]);

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="task/[id]" options={{ presentation: 'modal', title: 'Task', headerBackTitle: 'Back' }} />
        <Stack.Screen name="habit/[id]" options={{ title: 'Habit', headerBackTitle: 'Back' }} />
        <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', title: 'Transaction', headerBackTitle: 'Back' }} />
        <Stack.Screen name="account/[id]" options={{ title: 'Account', headerBackTitle: 'Back' }} />
        <Stack.Screen name="categories" options={{ title: 'Categories & budgets', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Settings', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/security" options={{ title: 'Security', headerBackTitle: 'Settings' }} />
      </Stack>
      <Toast />
    </>
  );
}
