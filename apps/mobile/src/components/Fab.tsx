import { Pressable, Text } from 'react-native';

export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-brand shadow-lg active:bg-brand-dark"
    >
      <Text className="text-3xl font-light leading-9 text-white">+</Text>
    </Pressable>
  );
}
