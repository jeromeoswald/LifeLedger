import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, P, Screen } from '@/components/ui';

export default function Welcome() {
  return (
    <Screen narrow>
      <View className="flex-1 justify-center">
        <View className="mb-6 h-16 w-16 items-center justify-center rounded-2xl bg-brand">
          <Text className="text-3xl font-bold text-white">L</Text>
        </View>
        <Text accessibilityRole="header" className="mb-3 text-4xl font-bold text-slate-900 dark:text-white">
          LifeLedger
        </Text>
        <P className="mb-10 text-lg">Your tasks, habits and money in one place, in any currency.</P>
        <Button title="Create account" onPress={() => router.push('/sign-up')} />
        <Button title="Sign in" variant="secondary" className="mt-3" onPress={() => router.push('/sign-in')} />
      </View>
    </Screen>
  );
}
