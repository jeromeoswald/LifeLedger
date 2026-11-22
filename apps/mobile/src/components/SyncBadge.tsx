import { Pressable, Text } from 'react-native';
import { syncNow, useSync } from '@/lib/sync';

/** Header pill: Synced / Syncing… / Offline (n pending). Tap to sync now. */
export function SyncBadge() {
  const { status, pending } = useSync();
  const label =
    status === 'syncing'
      ? 'Syncing…'
      : status === 'offline'
        ? `Offline${pending ? ` (${pending} pending)` : ''}`
        : status === 'error'
          ? `Sync failed${pending ? ` (${pending})` : ''}`
          : pending
            ? `${pending} pending`
            : 'Synced';
  const tone = status === 'offline' || status === 'error' ? 'bg-amber-100 dark:bg-amber-900' : 'bg-slate-100 dark:bg-slate-800';
  const icon = status === 'syncing' ? '⟳' : status === 'offline' ? '⚠' : status === 'error' ? '!' : pending ? '↑' : '✓';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Tap to sync now`}
      onPress={() => void syncNow()}
      className={`mr-2 min-h-11 flex-row items-center rounded-full px-3 ${tone}`}
    >
      <Text className="text-xs text-slate-700 dark:text-slate-200">
        {icon} {label}
      </Text>
    </Pressable>
  );
}
