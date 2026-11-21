import { Pressable, ScrollView, Text, View } from 'react-native';
import { heatmapWeeks, isScheduled, type Habit } from '@lifeledger/shared';
import { formatDate } from '@/lib/format';
import { formatHabitValue } from '@/lib/habits';

const ROWS = ['M', '', 'W', '', 'F', '', 'S'];

/** GitHub-style grid of the last 17 weeks (Monday rows on top). Tap a day to edit it. */
export function Heatmap({
  habit,
  values,
  today,
  selected,
  onSelect,
}: {
  habit: Habit;
  values: Map<string, number>;
  today: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const weeks = heatmapWeeks(today);
  const tone = (d: string) => {
    if (d > today) return 'bg-transparent';
    const v = values.get(d) ?? 0;
    if (v >= habit.target) return 'bg-brand';
    if (v > 0) return v / habit.target >= 0.5 ? 'bg-teal-400 dark:bg-teal-700' : 'bg-teal-200 dark:bg-teal-900';
    return isScheduled(habit, d) ? 'bg-slate-200 dark:bg-slate-800' : 'bg-slate-100 dark:bg-slate-900';
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="flex-row">
        <View className="mr-1">
          {ROWS.map((r, i) => (
            <Text key={i} className="h-5 text-[10px] leading-5 text-slate-500">
              {r}
            </Text>
          ))}
        </View>
        {weeks.map((w) => (
          <View key={w[0]} className="mr-1">
            {w.map((d) => (
              <Pressable
                key={d}
                disabled={d > today}
                accessibilityRole="button"
                accessibilityLabel={`${formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}: ${formatHabitValue(habit, values.get(d) ?? 0)}`}
                accessibilityState={{ selected: d === selected }}
                onPress={() => onSelect(d)}
                hitSlop={2}
                className={`mb-1 h-4 w-4 rounded-sm ${tone(d)} ${d === selected ? 'border-2 border-amber-400' : ''}`}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      <View className="mt-1 flex-row items-center gap-1">
        <Text className="text-[10px] text-slate-500">Less</Text>
        {['bg-slate-200 dark:bg-slate-800', 'bg-teal-200 dark:bg-teal-900', 'bg-teal-400 dark:bg-teal-700', 'bg-brand'].map((c) => (
          <View key={c} className={`h-3 w-3 rounded-sm ${c}`} />
        ))}
        <Text className="text-[10px] text-slate-500">More</Text>
      </View>
    </View>
  );
}
