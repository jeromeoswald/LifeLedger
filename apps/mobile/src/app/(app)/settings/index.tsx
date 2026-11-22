import { useEffect, useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { formatHours, type User } from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { Button, Card, ErrorText, P, Screen, SectionTitle, Segmented } from '@/components/ui';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { StepBtn } from '@/components/habits/HabitCard';
import { signOut, updateMe } from '@/lib/session';
import { disableWebPush, enableWebPush, promptInstall, usePwa, webPushState, type PushState } from '@/lib/pwa';
import { showError } from '@/stores/toast';

/** Browser alarms + habit reminders via Web Push (phones use local notifications instead). */
function WebNotifications() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const installEvent = usePwa((s) => s.installEvent);
  useEffect(() => {
    void webPushState().then(setState);
  }, []);
  const toggle = async () => {
    setBusy(true);
    try {
      setState(await (state === 'enabled' ? disableWebPush() : enableWebPush()));
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionTitle>This browser</SectionTitle>
      <Card>
        <Text className="text-base text-slate-900 dark:text-white">Task alarms & habit reminders</Text>
        <P className="mb-2 text-sm">
          {state === 'enabled'
            ? 'On: this browser gets a notification even when LifeLedger is closed.'
            : state === 'denied'
              ? 'Blocked in browser settings. Allow notifications for this site to turn them on.'
              : state === 'unsupported'
                ? 'Available in the installed/live web app (not in development, and not on every browser).'
                : 'Off.'}
        </P>
        {state === 'enabled' || state === 'off' ? (
          <Button title={state === 'enabled' ? 'Turn off' : 'Turn on notifications'} variant={state === 'enabled' ? 'secondary' : 'primary'} loading={busy} onPress={() => void toggle()} />
        ) : null}
        {installEvent ? <Button title="📲 Install app" variant="secondary" className="mt-2" onPress={() => void promptInstall()} /> : null}
      </Card>
    </>
  );
}

type Patch =Partial<Pick<User, 'baseCurrency' | 'attendanceDefaultMinutes' | 'weekStart' | 'showAttendanceCard'>>;

export default function Settings() {
  const user = useAuth((s) => s.user);
  const m = useMutation({ mutationFn: (patch: Patch) => updateMe(patch) });
  if (!user) return null;
  const mins = user.attendanceDefaultMinutes;

  return (
    <Screen>
      <SectionTitle>Account</SectionTitle>
      <Card>
        <Text className="text-base font-semibold text-slate-900 dark:text-white">{user.email}</Text>
        <P className="mt-1">Time zone: {user.timeZone}</P>
      </Card>
      <CurrencyPicker label="Base currency" value={user.baseCurrency} onChange={(c) => m.mutate({ baseCurrency: c })} />

      <SectionTitle>Attendance</SectionTitle>
      <Card>
        <View className="min-h-12 flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-base text-slate-900 dark:text-white">Default working hours</Text>
            <P className="text-xs">Used for new Present days only</P>
          </View>
          <StepBtn label="Default hours minus half an hour" text="−" disabled={mins <= 30} onPress={() => m.mutate({ attendanceDefaultMinutes: mins - 30 })} />
          <Text accessibilityLiveRegion="polite" className="w-14 text-center text-lg font-bold text-slate-900 dark:text-white">
            {formatHours(mins)} h
          </Text>
          <StepBtn label="Default hours plus half an hour" text="+" primary disabled={mins >= 1440} onPress={() => m.mutate({ attendanceDefaultMinutes: mins + 30 })} />
        </View>
        <Text className="mb-1 mt-3 text-base text-slate-900 dark:text-white">Week starts on</Text>
        <Segmented
          label="Week starts on"
          value={user.weekStart}
          onChange={(w) => m.mutate({ weekStart: w })}
          options={[
            { value: 1 as const, label: 'Monday' },
            { value: 0 as const, label: 'Sunday' },
          ]}
        />
        <View className="min-h-12 flex-row items-center justify-between">
          <Text className="text-base text-slate-900 dark:text-white">Show "Today's attendance" on Home</Text>
          <Switch
            accessibilityLabel="Show today's attendance card on Home"
            value={user.showAttendanceCard}
            onValueChange={(v) => m.mutate({ showAttendanceCard: v })}
          />
        </View>
      </Card>
      <ErrorText>{m.error ? m.error.message : null}</ErrorText>

      {Platform.OS === 'web' ? <WebNotifications /> : null}

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
