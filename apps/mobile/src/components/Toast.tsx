import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useToast } from '@/stores/toast';

export function Toast() {
  const { message, tone, action, durationMs, id, clear } = useToast();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, id, clear]);
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      className={`absolute bottom-24 left-4 right-4 min-h-12 flex-row items-center self-center rounded-xl px-4 py-2 md:max-w-md ${
        tone === 'error' ? 'bg-red-600' : 'bg-slate-800 dark:bg-slate-700'
      }`}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={`${message}. Dismiss`} onPress={clear} className="min-h-11 flex-1 justify-center">
        <Text className="text-white">{message}</Text>
      </Pressable>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => {
            clear();
            action.onPress();
          }}
          className="ml-2 min-h-11 justify-center px-3"
        >
          <Text className="font-bold uppercase text-teal-300">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
