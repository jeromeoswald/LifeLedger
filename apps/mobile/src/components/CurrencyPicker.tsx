import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CURRENCIES, getCurrency, type Currency } from '@lifeledger/shared';

const FAVOURITES = ['AED', 'USD', 'INR'];

export function CurrencyPicker({
  label,
  value,
  onChange,
  variant = 'field',
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  /** 'pill' = compact header/inline trigger */
  variant?: 'field' | 'pill';
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = getCurrency(value);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (c: Currency) => !s || c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s);
    const favs = FAVOURITES.map(getCurrency).filter(match);
    return [...favs, ...CURRENCIES.filter((c) => !FAVOURITES.includes(c.code) && match(c))];
  }, [q]);

  return (
    <View className={variant === 'field' ? 'mb-4' : ''}>
      {variant === 'field' ? (
        <>
          <Text className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{label}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${current.code}, ${current.name}. Change`}
            onPress={() => setOpen(true)}
            className="min-h-12 flex-row items-center justify-between rounded-xl border border-slate-300 bg-white px-4 dark:border-slate-700 dark:bg-slate-900"
          >
            <Text className="text-base text-slate-900 dark:text-white">
              {current.code} — {current.name}
            </Text>
            <Text className="text-slate-400">▾</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${current.code}. Change`}
          onPress={() => setOpen(true)}
          className="min-h-11 flex-row items-center justify-center rounded-full border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
        >
          <Text className="font-semibold text-slate-900 dark:text-white">{current.code}</Text>
          <Text className="ml-1 text-slate-400">▾</Text>
        </Pressable>
      )}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
          <View className="w-full max-w-xl flex-1 self-center px-4">
            <View className="flex-row items-center gap-2 py-3">
              <TextInput
                autoFocus
                value={q}
                onChangeText={setQ}
                placeholder="Search currency or code"
                placeholderTextColor="#94a3b8"
                accessibilityLabel="Search currency"
                autoCapitalize="none"
                className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <Pressable accessibilityRole="button" onPress={() => setOpen(false)} className="min-h-12 justify-center px-3">
                <Text className="font-semibold text-brand dark:text-brand-light">Close</Text>
              </Pressable>
            </View>
            <FlatList
              data={list}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item, index }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.code === value }}
                  onPress={() => {
                    onChange(item.code);
                    setOpen(false);
                    setQ('');
                  }}
                  className={`min-h-12 flex-row items-center border-b border-slate-200 px-2 dark:border-slate-800 ${
                    item.code === value ? 'bg-teal-50 dark:bg-teal-950' : ''
                  }`}
                >
                  <Text className="w-14 font-semibold text-slate-900 dark:text-white">{item.code}</Text>
                  <Text className="flex-1 text-slate-700 dark:text-slate-300">{item.name}</Text>
                  {index < FAVOURITES.length && !q ? <Text className="text-amber-500">★</Text> : null}
                </Pressable>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
