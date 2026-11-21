import { Pressable, Text, View } from 'react-native';
import { sessionSeconds, type Task, type TimeSession } from '@lifeledger/shared';
import { clock } from '@/lib/format';
import { stopTimer, useNow } from '@/lib/work';

/** Live "tracking" bar for the running session, with a Stop button. */
export function TimerBar({ session, task }: { session: TimeSession | undefined; task: Task | undefined }) {
  const now = useNow(!!session);
  if (!session) return null;
  return (
    <View className="mb-3 min-h-14 flex-row items-center rounded-2xl bg-teal-50 px-4 dark:bg-teal-950">
      <View className="mr-3 h-2.5 w-2.5 rounded-full bg-red-500" />
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm text-slate-600 dark:text-slate-300">
          Tracking: {task?.title ?? 'Deleted task'}
        </Text>
        <Text accessibilityLiveRegion="polite" className="font-mono text-lg font-semibold text-slate-900 dark:text-white">
          {clock(sessionSeconds(session, now))}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop timer"
        onPress={() => void stopTimer()}
        className="min-h-11 justify-center rounded-xl bg-red-600 px-4"
      >
        <Text className="font-semibold text-white">Stop</Text>
      </Pressable>
    </View>
  );
}
