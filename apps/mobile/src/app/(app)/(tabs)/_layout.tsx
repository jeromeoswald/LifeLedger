import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Tabs, router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useAuth } from '@/stores/auth';
import { useDisplayCurrency, useSettings } from '@/stores/settings';
import { CurrencyPicker } from '@/components/CurrencyPicker';

const TABS: { name: string; title: string; icon: SymbolViewProps['name'] }[] = [
  { name: 'index', title: 'Home', icon: { ios: 'house', android: 'home', web: 'home' } },
  { name: 'work', title: 'Work', icon: { ios: 'briefcase', android: 'work', web: 'work' } },
  { name: 'habits', title: 'Habits', icon: { ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' } },
  { name: 'wallet', title: 'Wallet', icon: { ios: 'wallet.bifold', android: 'account_balance_wallet', web: 'account_balance_wallet' } },
  { name: 'converter', title: 'Converter', icon: { ios: 'arrow.left.arrow.right', android: 'currency_exchange', web: 'currency_exchange' } },
];

function Avatar() {
  const email = useAuth((s) => s.user?.email ?? '?');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open settings"
      onPress={() => router.push('/settings')}
      className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-brand"
    >
      <Text className="text-lg font-bold text-white">{email[0]?.toUpperCase()}</Text>
    </Pressable>
  );
}

/** Header switch: re-shows every balance and total in the chosen currency (approx., latest rates). */
function DisplayCurrencySwitch() {
  const base = useAuth((s) => s.user?.baseCurrency);
  const display = useDisplayCurrency(base);
  const setDisplay = useSettings((s) => s.setDisplayCurrency);
  return (
    <View className="mr-2">
      <CurrencyPicker
        variant="pill"
        label="Display currency"
        value={display}
        onChange={(c) => void setDisplay(c === base ? null : c)}
      />
    </View>
  );
}

function HeaderRight() {
  return (
    <View className="flex-row items-center">
      <DisplayCurrencySwitch />
      <Avatar />
    </View>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  // Sidebar on web wider than 768px; bottom bar everywhere else.
  const sidebar = Platform.OS === 'web' && width > 768;

  return (
    <Tabs
      screenOptions={{
        headerRight: () => <HeaderRight />,
        tabBarPosition: sidebar ? 'left' : 'bottom',
        tabBarVariant: sidebar ? 'material' : 'uikit',
        tabBarLabelPosition: sidebar ? 'beside-icon' : 'below-icon',
        tabBarActiveTintColor: '#0F766E',
        tabBarStyle: sidebar ? { minWidth: 200 } : undefined,
        tabBarItemStyle: { minHeight: 44 },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, size }) => <SymbolView name={t.icon} tintColor={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
