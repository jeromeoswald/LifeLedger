import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { promptInstall, usePwa } from '@/lib/pwa';

/** Web only: shown when the browser offers to install the PWA. */
export function InstallBanner() {
  const installEvent = usePwa((s) => s.installEvent);
  const [dismissed, setDismissed] = useState(false);
  if (!installEvent || dismissed) return null;
  return (
    <View className="mb-3 min-h-12 flex-row items-center rounded-2xl bg-teal-50 px-4 dark:bg-teal-950">
      <Text className="flex-1 text-sm text-slate-800 dark:text-slate-100">📲 Install LifeLedger as an app: works offline, opens from your home screen.</Text>
      <Pressable accessibilityRole="button" onPress={() => void promptInstall()} className="min-h-11 justify-center rounded-xl bg-brand px-3">
        <Text className="font-semibold text-white">Install app</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => setDismissed(true)} className="h-11 w-11 items-center justify-center">
        <Text className="text-slate-500">✕</Text>
      </Pressable>
    </View>
  );
}
