import { Pressable, Text, View } from 'react-native';
import { getCurrency } from '@lifeledger/shared';

/**
 * Big calculator-style pad. `value` is a plain decimal string ("125.5"); it respects the
 * currency's minor digits (no "." for JPY, up to 3 decimals for KWD).
 */
export function AmountPad({ value, currency, onChange }: { value: string; currency: string; onChange: (v: string) => void }) {
  const digits = getCurrency(currency).digits;
  const press = (k: string) => {
    if (k === '⌫') return onChange(value.slice(0, -1));
    if (k === '.') {
      if (!digits || value.includes('.')) return;
      return onChange((value || '0') + '.');
    }
    const [, dec] = value.split('.');
    if (dec !== undefined && dec.length >= digits) return;
    if (value.replace('.', '').length >= 12) return;
    onChange(value === '0' ? k : value + k);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', digits ? '.' : '', '0', '⌫'];
  return (
    <View className="flex-row flex-wrap justify-between gap-y-2">
      {keys.map((k, i) =>
        k ? (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={k === '⌫' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
            onPress={() => press(k)}
            onLongPress={k === '⌫' ? () => onChange('') : undefined}
            className="h-14 items-center justify-center rounded-2xl bg-white active:bg-slate-200 dark:bg-slate-900 dark:active:bg-slate-800"
            style={{ width: '32%' }}
          >
            <Text className="text-2xl font-medium text-slate-900 dark:text-white">{k}</Text>
          </Pressable>
        ) : (
          <View key={`blank${i}`} style={{ width: '32%' }} />
        ),
      )}
    </View>
  );
}
