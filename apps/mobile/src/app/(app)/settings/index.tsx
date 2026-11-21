import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/stores/auth';
import { Button, Card, ErrorText, P, Screen, SectionTitle } from '@/components/ui';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { signOut, updateMe } from '@/lib/session';

export default function Settings() {
  const user = useAuth((s) => s.user);
  const m = useMutation({ mutationFn: (baseCurrency: string) => updateMe({ baseCurrency }) });
  if (!user) return null;

  return (
    <Screen>
      <SectionTitle>Account</SectionTitle>
      <Card>
        <Text className="text-base font-semibold text-slate-900 dark:text-white">{user.email}</Text>
        <P className="mt-1">Time zone: {user.timeZone}</P>
      </Card>
      <CurrencyPicker label="Base currency" value={user.baseCurrency} onChange={(c) => m.mutate(c)} />
      <ErrorText>{m.error ? m.error.message : null}</ErrorText>

      <SectionTitle>Privacy</SectionTitle>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/settings/security')}
        className="mb-4 min-h-12 flex-row items-center justify-between rounded-2xl bg-white px-4 dark:bg-slate-900"
      >
        <Text className="text-base text-slate-900 dark:text-white">Security & app lock</Text>
        <Text className="text-slate-400">›</Text>
      </Pressable>

      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
