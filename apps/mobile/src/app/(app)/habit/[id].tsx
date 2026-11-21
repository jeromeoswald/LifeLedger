import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  addDays,
  describeSchedule,
  habitSchema,
  habitNotes,
  habitStats,
  habitValues,
  type Habit,
  type HabitEntry,
  type HabitSchedule,
  type HabitType,
} from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { Button, Card, ErrorText, Field, P, Screen, SectionTitle, Segmented, fieldErrors } from '@/components/ui';
import { Chip, NavBtn } from '@/components/DateField';
import { Heatmap } from '@/components/habits/Heatmap';
import { StepBtn } from '@/components/habits/HabitCard';
import { relativeDay } from '@/lib/format';
import { archiveHabit, deleteHabit, formatHabitValue, setHabitNote, setHabitValue, useHabitEntries, useHabits } from '@/lib/habits';
import { newBase, saveRecord } from '@/lib/records';
import { useToday } from '@/lib/work';
import { ensureAlarmPermission } from '@/lib/alarms';

export default function HabitScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const tz = useAuth((s) => s.user?.timeZone ?? 'Asia/Dubai');
  const today = useToday(tz);
  const { data: habits, isLoading } = useHabits();
  const { data: entries = [] } = useHabitEntries();
  const habit = habits?.find((h) => h.clientId === id);

  if (id === 'new') return <Screen><HabitForm today={today} /></Screen>;
  if (!habit) return <Screen><P>{isLoading ? 'Loading…' : 'This habit no longer exists.'}</P></Screen>;

  return (
    <Screen>
      <Text accessibilityRole="header" className="text-2xl font-bold text-slate-900 dark:text-white">
        {habit.name}
      </Text>
      <P className="mb-3">
        {describeSchedule(habit.schedule)}
        {habit.reminderTime ? ` · reminder ${habit.reminderTime}` : ''}
        {habit.archivedAt ? ' · archived' : ''}
      </P>
      <Stats habit={habit} entries={entries} tz={tz} initialDate={date ?? today} today={today} />
      <SectionTitle>Edit habit</SectionTitle>
      <HabitForm key={habit.updatedAt} existing={habit} today={today} />
      <Button
        title={habit.archivedAt ? 'Unarchive' : 'Archive'}
        variant="secondary"
        className="mt-3"
        onPress={async () => {
          if ((await archiveHabit(habit, !habit.archivedAt)) && !habit.archivedAt) router.back();
        }}
      />
      <Button
        title="Delete habit"
        variant="ghost"
        className="mt-2"
        onPress={async () => {
          if (await deleteHabit(habit)) router.back();
        }}
      />
    </Screen>
  );
}

function Stats({ habit, entries, tz, initialDate, today }: { habit: Habit; entries: HabitEntry[]; tz: string; initialDate: string; today: string }) {
  const [selected, setSelected] = useState(initialDate > today ? today : initialDate);
  const s = habitStats(habit, entries, new Date(), tz);
  const values = habitValues(entries, habit.clientId);
  const value = values.get(selected) ?? 0;
  const notes = habitNotes(entries, habit.clientId);
  const savedNote = notes.find((n) => n.date === selected)?.note ?? '';
  const unit = s.unit === 'weeks' ? 'weeks' : 'days';
  const step = habit.type === 'duration' ? 5 : 1;

  return (
    <View>
      <View className="flex-row gap-3">
        <Card className="flex-1">
          <P className="text-sm">Current streak</P>
          <Text className="text-2xl font-bold text-slate-900 dark:text-white">🔥 {s.current}</Text>
          <P className="text-xs">{unit}</P>
        </Card>
        <Card className="flex-1">
          <P className="text-sm">Best</P>
          <Text className="text-2xl font-bold text-slate-900 dark:text-white">{s.best}</Text>
          <P className="text-xs">{unit}</P>
        </Card>
        <Card className="flex-1">
          <P className="text-sm">Last 30 days</P>
          <Text className="text-2xl font-bold text-slate-900 dark:text-white">{s.rate30 === null ? '–' : `${Math.round(s.rate30 * 100)}%`}</Text>
          <P className="text-xs">{habit.schedule.kind === 'perWeek' ? `${s.thisWeek}/${habit.schedule.times} this week` : 'complete'}</P>
        </Card>
      </View>

      <Card>
        <Heatmap habit={habit} values={values} today={today} selected={selected} onSelect={setSelected} />
      </Card>

      {/* Day editor: the accessible way to edit any past day (the heatmap cells are small). */}
      <Card>
        <View className="flex-row items-center justify-between">
          <NavBtn label="Previous day" text="‹" onPress={() => setSelected(addDays(selected, -1))} />
          <Text className="text-base font-semibold text-slate-900 dark:text-white">{relativeDay(selected, today)}</Text>
          <NavBtn label="Next day" text="›" onPress={() => selected < today && setSelected(addDays(selected, 1))} />
        </View>
        <View className="mt-2 flex-row items-center justify-center gap-3">
          {habit.type === 'yesno' ? (
            <Button
              title={value ? '✓ Done — tap to undo' : 'Mark done'}
              variant={value ? 'primary' : 'secondary'}
              onPress={() => void setHabitValue(habit, selected, value ? 0 : 1)}
              className="flex-1"
            />
          ) : (
            <>
              <StepBtn label={`Minus ${step}`} text="−" disabled={value <= 0} onPress={() => void setHabitValue(habit, selected, value - step)} />
              <TextInput
                accessibilityLabel={`Value for ${selected}`}
                keyboardType="number-pad"
                value={String(value)}
                onChangeText={(t) => void setHabitValue(habit, selected, Number(t.replace(/\D/g, '').slice(0, 5)) || 0)}
                className="min-h-12 w-20 rounded-xl border border-slate-300 bg-white text-center text-lg text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <StepBtn label={`Plus ${step}`} text="+" primary onPress={() => void setHabitValue(habit, selected, value + step)} />
            </>
          )}
        </View>
        <P className="mt-2 text-center text-sm">{formatHabitValue(habit, value)}</P>
        <DayNote key={`${selected}:${savedNote}`} habit={habit} date={selected} saved={savedNote} />
      </Card>

      {notes.length ? (
        <>
          <SectionTitle>Recent notes</SectionTitle>
          <Card>
            {notes.slice(0, 10).map((n) => (
              <Pressable
                key={n.date}
                accessibilityRole="button"
                accessibilityLabel={`${relativeDay(n.date, today)}: ${n.note}. Open this day`}
                onPress={() => setSelected(n.date)}
                className={`min-h-11 justify-center border-b border-slate-100 py-2 dark:border-slate-800 ${n.date === selected ? 'bg-teal-50 dark:bg-teal-950' : ''}`}
              >
                <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {relativeDay(n.date, today)} · {formatHabitValue(habit, values.get(n.date) ?? 0)}
                </Text>
                <Text className="text-base text-slate-900 dark:text-white">{n.note}</Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );
}

/** Free-text note for one day, e.g. "Pages 45–72" for a reading habit. */
function DayNote({ habit, date, saved }: { habit: Habit; date: string; saved: string }) {
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const dirty = text.trim() !== saved;
  const placeholder =
    habit.type === 'duration' ? 'e.g. Pages 45–72, chapter 3' : habit.type === 'count' ? 'e.g. 2 before lunch, rest after' : 'e.g. How it went';

  return (
    <View className="mt-3">
      <Text className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">Note for this day (optional)</Text>
      <TextInput
        accessibilityLabel={`Note for ${date}`}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        multiline
        maxLength={500}
        className="min-h-20 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-xs text-slate-500">{text.length}/500</Text>
        <Button
          title={dirty ? 'Save note' : saved ? 'Saved ✓' : 'Save note'}
          variant={dirty ? 'primary' : 'secondary'}
          disabled={!dirty}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await setHabitNote(habit, date, text);
            setBusy(false);
          }}
        />
      </View>
    </View>
  );
}

const DAY_CHIPS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ d, label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]! }));
const REMINDERS = ['07:00', '09:00', '12:00', '18:00', '21:00'];

function HabitForm({ existing, today }: { existing?: Habit; today: string }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<HabitType>(existing?.type ?? 'yesno');
  const [target, setTarget] = useState(String(existing?.target ?? 1));
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const [kind, setKind] = useState<HabitSchedule['kind']>(existing?.schedule.kind ?? 'daily');
  const [days, setDays] = useState<number[]>(existing?.schedule.kind === 'weekdays' ? existing.schedule.days : [1, 2, 3, 4, 5]);
  const [times, setTimes] = useState(existing?.schedule.kind === 'perWeek' ? existing.schedule.times : 3);
  const [reminder, setReminder] = useState(existing?.reminderTime ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const save = async () => {
    const schedule: HabitSchedule = kind === 'daily' ? { kind } : kind === 'weekdays' ? { kind, days } : { kind, times };
    const parsed = habitSchema.safeParse({
      ...(existing ?? { ...newBase(), startDate: today }),
      name,
      type,
      target: type === 'yesno' ? 1 : Number(target) || 0,
      unit: type === 'count' ? unit : type === 'duration' ? 'min' : '',
      schedule,
      reminderTime: reminder || null,
    });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error.issues));
    if (!parsed.success) return;
    if (parsed.data.reminderTime && !(await ensureAlarmPermission()) && !note) {
      setNote('Reminders ring on your phone. Turn on notifications for LifeLedger there (the web gets them in a later update).');
    }
    setBusy(true);
    const ok = await saveRecord('habits', parsed.data);
    setBusy(false);
    if (ok && !existing) router.back();
  };

  return (
    <View>
      <Field label="Name" value={name} onChangeText={setName} error={errors.name} placeholder="e.g. Drink water" autoFocus={!existing} />
      <SectionTitle>Type</SectionTitle>
      <Segmented
        label="Habit type"
        value={type}
        onChange={(t) => {
          setType(t);
          if (t === 'yesno') setTarget('1');
          else if (target === '1') setTarget(t === 'count' ? '8' : '20');
        }}
        options={[
          { value: 'yesno', label: 'Yes / No' },
          { value: 'count', label: 'Count' },
          { value: 'duration', label: 'Duration' },
        ]}
      />
      {type !== 'yesno' ? (
        <View className="flex-row gap-3">
          <View className="w-32">
            <Field
              label={type === 'count' ? 'Daily target' : 'Minutes a day'}
              value={target}
              onChangeText={(t) => setTarget(t.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              error={errors.target}
            />
          </View>
          {type === 'count' ? (
            <View className="flex-1">
              <Field label="Unit (optional)" value={unit} onChangeText={setUnit} placeholder="glasses, pages…" error={errors.unit} />
            </View>
          ) : null}
        </View>
      ) : null}

      <SectionTitle>Schedule</SectionTitle>
      <Segmented
        label="Schedule"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'daily', label: 'Every day' },
          { value: 'weekdays', label: 'Chosen days' },
          { value: 'perWeek', label: 'X per week' },
        ]}
      />
      {kind === 'weekdays' ? (
        <View className="mb-2 flex-row flex-wrap gap-2">
          {DAY_CHIPS.map(({ d, label }) => (
            <Chip key={d} text={label} selected={days.includes(d)} onPress={() => setDays((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]))} />
          ))}
        </View>
      ) : null}
      {kind === 'perWeek' ? (
        <View className="mb-2 flex-row flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <Chip key={n} text={`${n}×`} selected={times === n} onPress={() => setTimes(n)} />
          ))}
        </View>
      ) : null}
      <ErrorText>{errors.schedule}</ErrorText>

      <SectionTitle>Reminder</SectionTitle>
      <View className="mb-2 flex-row flex-wrap gap-2">
        <Chip text="Off" selected={!reminder} onPress={() => setReminder('')} />
        {REMINDERS.map((r) => (
          <Chip key={r} text={r} selected={reminder === r} onPress={() => setReminder(r)} />
        ))}
      </View>
      <View className="w-36">
        <Field label="Or a time (24h)" value={reminder} onChangeText={(t) => setReminder(t.replace(/[^\d:]/g, '').slice(0, 5))} placeholder="HH:MM" error={errors.reminderTime} />
      </View>
      {note ? <P className="mb-2 text-sm">{note}</P> : null}

      <Button title={existing ? 'Save changes' : 'Add habit'} onPress={() => void save()} loading={busy} />
      {existing ? null : (
        <Pressable accessibilityRole="button" onPress={() => router.back()} className="mt-2 min-h-11 items-center justify-center">
          <Text className="text-slate-500">Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}
