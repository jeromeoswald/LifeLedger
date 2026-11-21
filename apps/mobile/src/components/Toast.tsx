import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import { useToast } from '@/stores/toast';

export function Toast() {
  const { message, clear } = useToast();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, 8000); // long enough to read a budget alert; tap to dismiss sooner
    return () => clearTimeout(t);
  }, [message, clear]);
  if (!message) return null;
  return (
    <Pressable
      accessibilityRole="alert"
      accessibilityLabel={`${message}. Tap to dismiss`}
      onPress={clear}
      className="absolute bottom-24 left-4 right-4 min-h-12 justify-center self-center rounded-xl bg-red-600 px-4 py-3 md:max-w-md"
    >
      <Text className="text-white">{message}</Text>
    </Pressable>
  );
}
