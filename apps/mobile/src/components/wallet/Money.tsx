import { Linking, Pressable, Text, View } from 'react-native';
import { formatMoney, type RatesSnapshot } from '@lifeledger/shared';
import { formatDate } from '@/lib/format';

/** Formatted amount; "≈ … approx." when it was converted with the latest (not historical) rate. */
export function Money({
  minor,
  currency,
  approx = false,
  className = 'text-base text-slate-900 dark:text-white',
  signed = false,
}: {
  minor: number | null;
  currency: string;
  approx?: boolean;
  className?: string;
  signed?: boolean;
}) {
  if (minor === null) return <Text className={className}>— {currency}</Text>;
  const text = formatMoney(Math.abs(minor), currency);
  const sign = signed ? (minor < 0 ? '−' : '+') : minor < 0 ? '−' : '';
  return (
    <Text className={className} accessibilityLabel={`${approx ? 'approximately ' : ''}${sign === '−' ? 'minus ' : ''}${text}`}>
      {approx ? '≈ ' : ''}
      {sign}
      {text}
      {approx ? <Text className="text-xs font-normal text-slate-500"> approx.</Text> : null}
    </Text>
  );
}

/** "Rates as of 20 Nov" + the attribution ExchangeRate-API requires. */
export function RatesNote({ rates, error }: { rates?: RatesSnapshot & { attribution?: { text: string; url: string } }; error?: boolean }) {
  if (!rates) {
    return <Text className="text-xs text-slate-500">{error ? 'Exchange rates unavailable — converted totals hidden.' : 'Loading rates…'}</Text>;
  }
  return (
    <View className="flex-row flex-wrap items-center">
      <Text className={`text-xs ${rates.stale ? 'text-amber-600' : 'text-slate-500'}`}>
        Rates as of {formatDate(rates.date, { day: 'numeric', month: 'short', year: 'numeric' })}
        {rates.stale ? ' (offline copy)' : ''} ·{' '}
      </Text>
      {rates.attribution ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(rates.attribution!.url)} hitSlop={8}>
          <Text className="text-xs text-brand underline dark:text-brand-light">{rates.attribution.text}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
