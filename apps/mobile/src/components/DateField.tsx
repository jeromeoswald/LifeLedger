import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addDays, addMonths, daysInMonth, parseDate, startOfWeek, weekday } from '@lifeledger/shared';
import { formatMonth, relativeDay } from '@/lib/format';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Date picker that works the same on web and native: quick chips plus a month grid. */
export function DateField({
  label,
  value,
  onChange,
  today,
  allowNone = true,
  initiallyOpen = false,
}: {
  label: string;
  value: string | null;
  onChange: (d: string | null) => void;
  today: string;
  allowNone?: boolean;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [month, setMonth] = useState((value ?? today).slice(0, 8) + '01');

  const nextMonday = addDays(startOfWeek(today), 7);
  const quick: [string, string | null][] = [
    ['Today', today],
    ['Tomorrow', addDays(today, 1)],
    ['Next Mon', nextMonday],
    ...(allowNone ? [['None', null] as [string, null]] : []),
  ];

  const { y, m } = parseDate(month);
  const lead = (weekday(month) + 6) % 7; // blanks before the 1st (Monday-first grid)
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth(y, m) }, (_, i) => addDays(month, i))];

  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {quick.map(([text, d]) => (
          <Chip key={text} text={text} selected={value === d} onPress={() => onChange(d)} />
        ))}
        <Chip
          text={value && !quick.some(([, d]) => d === value) ? relativeDay(value, today) : 'Pick…'}
          selected={!!value && !quick.some(([, d]) => d === value)}
          onPress={() => setOpen((o) => !o)}
        />
      </View>

      {open ? (
        <View className="mt-3 rounded-2xl bg-white p-3 dark:bg-slate-900">
          <View className="mb-2 flex-row items-center justify-between">
            <NavBtn label="Previous month" text="‹" onPress={() => setMonth(addMonths(month, -1, 1))} />
            <Text className="font-semibold text-slate-900 dark:text-white">{formatMonth(month)}</Text>
            <NavBtn label="Next month" text="›" onPress={() => setMonth(addMonths(month, 1, 1))} />
          </View>
          <View className="flex-row">
            {WEEKDAYS.map((w) => (
              <Text key={w} className="flex-1 text-center text-xs text-slate-500">
                {w}
              </Text>
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {cells.map((d, i) =>
              d ? (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={d}
                  accessibilityState={{ selected: d === value }}
                  onPress={() => {
                    onChange(d);
                    setOpen(false);
                  }}
                  className={`h-11 items-center justify-center rounded-full ${d === value ? 'bg-brand' : ''}`}
                  style={{ width: `${100 / 7}%` }}
                >
                  <Text
                    className={
                      d === value
                        ? 'font-bold text-white'
                        : d === today
                          ? 'font-bold text-brand dark:text-brand-light'
                          : 'text-slate-800 dark:text-slate-100'
                    }
                  >
                    {parseDate(d).d}
                  </Text>
                </Pressable>
              ) : (
                <View key={`b${i}`} style={{ width: `${100 / 7}%` }} className="h-11" />
              ),
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function Chip({ text, selected, onPress }: { text: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`min-h-11 justify-center rounded-full border px-4 ${
        selected ? 'border-brand bg-brand' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      <Text className={selected ? 'font-semibold text-white' : 'text-slate-800 dark:text-slate-100'}>{text}</Text>
    </Pressable>
  );
}

export function NavBtn({ label, text, onPress }: { label: string; text: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="h-11 w-11 items-center justify-center rounded-full">
      <Text className="text-2xl text-slate-700 dark:text-slate-200">{text}</Text>
    </Pressable>
  );
}
