import { Text, View } from 'react-native';

export function ComingSoon({ title, phase, children }: { title: string; phase: number; children: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50 px-6 dark:bg-slate-950">
      <Text accessibilityRole="header" className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
        {title}
      </Text>
      <Text className="mb-1 text-center text-base text-slate-600 dark:text-slate-300">{children}</Text>
      <Text className="text-sm text-slate-400">Coming in Phase {phase}</Text>
    </View>
  );
}
