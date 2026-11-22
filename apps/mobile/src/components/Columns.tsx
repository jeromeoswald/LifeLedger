import { Text, View } from 'react-native';

/**
 * Column chart from plain Views (same on web, iOS and Android, no chart dependency).
 * baseline 'range' scales between min and max so small moves (exchange rates) are visible;
 * 'zero' draws signed values up/down from a middle zero line (net income).
 */
export function Columns({
  values,
  labels,
  baseline = 'range',
  height = 140,
  a11y,
  stack,
}: {
  values: number[];
  labels?: string[];
  baseline?: 'range' | 'zero';
  height?: number;
  a11y: string;
  /** optional second series stacked on top of `values`, from zero (e.g. overtime on working hours) */
  stack?: number[];
}) {
  if (!values.length) return null;
  if (stack) {
    const top = Math.max(1e-9, ...values.map((v, i) => v + (stack[i] ?? 0)));
    return (
      <View accessibilityLabel={a11y}>
        <View className="flex-row" style={{ height, gap: 4 }}>
          {values.map((v, i) => (
            <View key={i} className="flex-1 justify-end">
              {stack[i] ? <View className="rounded-t bg-amber-500" style={{ height: `${(stack[i]! / top) * 100}%` }} /> : null}
              {v ? <View className={`bg-green-600 ${stack[i] ? '' : 'rounded-t'}`} style={{ height: `${(v / top) * 100}%` }} /> : null}
            </View>
          ))}
        </View>
        {labels ? (
          <View className="mt-1 flex-row" style={{ gap: 4 }}>
            {labels.map((l, i) => (
              <Text key={i} numberOfLines={1} className="flex-1 text-center text-[10px] text-slate-500">
                {l}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const maxAbs = Math.max(1e-9, ...values.map(Math.abs));
  const gap = values.length > 60 ? 0 : 2;

  return (
    <View accessibilityLabel={a11y}>
      <View className="flex-row" style={{ height, gap }}>
        {values.map((v, i) => {
          if (baseline === 'zero') {
            const pct = `${(Math.abs(v) / maxAbs) * 100}%` as const;
            return (
              <View key={i} className="flex-1">
                <View className="flex-1 justify-end">{v > 0 ? <View className="rounded-t bg-teal-500" style={{ height: pct }} /> : null}</View>
                <View className="h-px bg-slate-300 dark:bg-slate-700" />
                <View className="flex-1 justify-start">{v < 0 ? <View className="rounded-b bg-red-500" style={{ height: pct }} /> : null}</View>
              </View>
            );
          }
          const frac = max === min ? 0.5 : (v - min) / (max - min);
          return (
            <View key={i} className="flex-1 justify-end">
              <View className={i === values.length - 1 ? 'bg-brand' : 'bg-teal-300 dark:bg-teal-700'} style={{ height: `${8 + frac * 92}%` }} />
            </View>
          );
        })}
      </View>
      {labels ? (
        <View className="mt-1 flex-row" style={{ gap }}>
          {labels.map((l, i) => (
            <Text key={i} numberOfLines={1} className="flex-1 text-center text-[10px] text-slate-500">
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
