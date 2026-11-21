import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { addDays, describeSchedule, habitNotes, habitValues, isScheduled, weekday, type Habit, type HabitEntry, type HabitStats } from '@lifeledger/shared';
import { formatHabitValue, quickCheckIn, setHabitValue } from '@/lib/habits';

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Habit row with one-tap check-in, streak, and the last 7 days (tap a past day to edit it). */
export function HabitCard({ habit, entries, stats, compact = false }: { habit: Habit; entries: HabitEntry[]; stats: HabitStats; compact?: boolean }) {
  const values = habitValues(entries, habit.clientId);
  const notes = new Map(habitNotes(entries, habit.clientId).map((n) => [n.date, n.note]));
  const todayNote = notes.get(stats.today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(stats.today, i - 6));
  const open = (date?: string) => router.push({ pathname: '/habit/[id]', params: { id: habit.clientId, ...(date ? { date } : {}) } });
  const streakLabel = stats.unit === 'weeks' ? `${stats.current} wk` : `${stats.current} d`;
  const sub =
    habit.schedule.kind === 'perWeek'
      ? `${stats.thisWeek}/${habit.schedule.times} this week`
      : habit.type === 'yesno'
        ? describeSchedule(habit.schedule)
        : formatHabitValue(habit, stats.valueToday);

  return (
    <View className="mb-2 rounded-2xl bg-white p-3 dark:bg-slate-900">
      <View className="flex-row items-center">
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${habit.name}`} onPress={() => open()} className="min-h-11 flex-1 justify-center">
          <Text numberOfLines={1} className="text-base font-semibold text-slate-900 dark:text-white">
            {habit.name}
          </Text>
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            {sub} · 🔥 {streakLabel}
          </Text>
          {todayNote ? (
            <Text numberOfLines={1} className="text-xs italic text-slate-600 dark:text-slate-300">
              📝 {todayNote}
            </Text>
          ) : null}
        </Pressable>
        <CheckIn habit={habit} date={stats.today} value={stats.valueToday} done={stats.doneToday} />
      </View>

      {compact ? null : (
        <View className="mt-2 flex-row justify-between" accessibilityLabel="Last 7 days">
          {week.map((d) => {
            const v = values.get(d) ?? 0;
            const done = v >= habit.target;
            const scheduled = isScheduled(habit, d);
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={`${d}: ${formatHabitValue(habit, v)}${notes.has(d) ? `, note: ${notes.get(d)}` : ''}. ${habit.type === 'yesno' ? 'Tap to toggle' : 'Tap to edit'}`}
                onPress={() => (habit.type === 'yesno' ? void setHabitValue(habit, d, done ? 0 : 1) : open(d))}
                className="h-11 w-10 items-center justify-center"
              >
                <Text className={`text-[10px] ${d === stats.today ? 'font-bold text-brand dark:text-brand-light' : 'text-slate-500'}`}>
                  {LETTERS[weekday(d)]}
                </Text>
                <View
                  className={`mt-0.5 h-5 w-5 rounded-full ${
                    done ? 'bg-brand' : v > 0 ? 'bg-teal-200 dark:bg-teal-800' : scheduled ? 'border border-slate-300 dark:border-slate-600' : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function CheckIn({ habit, date, value, done }: { habit: Habit; date: string; value: number; done: boolean }) {
  if (habit.type === 'yesno') {
    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${habit.name} today`}
        onPress={() => void quickCheckIn(habit, date, value)}
        className={`h-12 w-12 items-center justify-center rounded-full border-2 ${done ? 'border-brand bg-brand' : 'border-slate-300 dark:border-slate-600'}`}
      >
        <Text className={`text-xl font-bold ${done ? 'text-white' : 'text-slate-300 dark:text-slate-600'}`}>✓</Text>
      </Pressable>
    );
  }
  const step = habit.type === 'count' ? 1 : 5;
  return (
    <View className="flex-row items-center">
      <StepBtn label={`Minus ${step}`} text="−" onPress={() => void setHabitValue(habit, date, value - step)} disabled={value <= 0} />
      <View className="w-14 items-center">
        <Text className={`text-base font-bold ${done ? 'text-brand dark:text-brand-light' : 'text-slate-900 dark:text-white'}`}>{value}</Text>
        <Text className="text-[10px] text-slate-500">/ {habit.target}</Text>
      </View>
      <StepBtn label={`Plus ${step}`} text={habit.type === 'count' ? '+' : '+5'} onPress={() => void quickCheckIn(habit, date, value)} primary />
    </View>
  );
}

export function StepBtn({ label, text, onPress, disabled, primary }: { label: string; text: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`h-11 w-11 items-center justify-center rounded-full ${primary ? 'bg-brand' : 'bg-slate-100 dark:bg-slate-800'} ${disabled ? 'opacity-40' : ''}`}
    >
      <Text className={`text-lg font-semibold ${primary ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>{text}</Text>
    </Pressable>
  );
}
