import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * Numeric PIN pad. With `length` it submits automatically when full;
 * without it (setting a new PIN) it shows an OK key and accepts 4-6 digits.
 */
export function PinPad({
  length,
  onSubmit,
  extraKey,
}: {
  length?: number;
  onSubmit: (pin: string) => void | Promise<void>;
  extraKey?: { label: string; onPress: () => void };
}) {
  const [pin, setPin] = useState('');
  const max = length ?? 6;

  const press = (d: string) => {
    if (pin.length >= max) return;
    const next = pin + d;
    setPin(next);
    if (length && next.length === length) {
      setPin('');
      void onSubmit(next);
    }
  };
  const ok = () => {
    if (pin.length < 4) return;
    const p = pin;
    setPin('');
    void onSubmit(p);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <View className="items-center">
      <View accessibilityLabel={`${pin.length} digits entered`} className="mb-8 h-4 flex-row gap-4">
        {Array.from({ length: length ?? Math.max(4, pin.length) }, (_, i) => (
          <View
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-brand ${i < pin.length ? 'bg-brand' : ''}`}
          />
        ))}
      </View>
      <View className="w-72 flex-row flex-wrap justify-between gap-y-4">
        {keys.map((k) => (
          <Key key={k} label={k} onPress={() => press(k)} />
        ))}
        {extraKey ? <Key label={extraKey.label} onPress={extraKey.onPress} small /> : <View className="h-20 w-20" />}
        <Key label="0" onPress={() => press('0')} />
        {length ? (
          <Key label="⌫" a11y="Delete" onPress={() => setPin((p) => p.slice(0, -1))} />
        ) : pin.length >= 4 ? (
          <Key label="OK" onPress={ok} small />
        ) : (
          <Key label="⌫" a11y="Delete" onPress={() => setPin((p) => p.slice(0, -1))} />
        )}
      </View>
    </View>
  );
}

function Key({ label, onPress, small, a11y }: { label: string; onPress: () => void; small?: boolean; a11y?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      onPress={onPress}
      className="h-20 w-20 items-center justify-center rounded-full bg-slate-200 active:bg-slate-300 dark:bg-slate-800 dark:active:bg-slate-700"
    >
      <Text className={`${small ? 'text-sm' : 'text-3xl'} font-medium text-slate-900 dark:text-white`}>{label}</Text>
    </Pressable>
  );
}
