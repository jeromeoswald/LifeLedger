import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { STATUS_LABEL, addDays, attendanceByDate, formatHours, type Attendance } from '@lifeledger/shared';
import { Card, P } from '@/components/ui';
import { DateField, NavBtn } from '@/components/DateField';
import { StepBtn } from '@/components/habits/HabitCard';
import { formatLongDate, relativeDay } from '@/lib/format';
import { saveAttendance, useAttendance } from '@/lib/attendance';
import { STATUS_STYLE, StatusPicker } from './StatusPicker';

const DEBOUNCE_MS = 600;

export function DayEntry({ date, onDate, today, defaultMinutes }: { date: string; onDate: (d: string) => void; today: string; defaultMinutes: number }) {
  const { data = [], isLoading } = useAttendance(date, date);
  const entry = attendanceByDate(data).get(date);
  const [showCal, setShowCal] = useState(false);

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <NavBtn label="Previous day" text="‹" onPress={() => onDate(addDays(date, -1))} />
        <Pressable accessibilityRole="button" accessibilityLabel={`${formatLongDate(date)}. Open calendar`} onPress={() => setShowCal((s) => !s)} className="min-h-11 items-center justify-center px-2">
          <Text className="text-lg font-semibold text-slate-900 dark:text-white">{relativeDay(date, today)}</Text>
          <Text className="text-xs text-slate-500">{formatLongDate(date)} ▾</Text>
        </Pressable>
        <NavBtn label="Next day" text="›" onPress={() => onDate(addDays(date, 1))} />
      </View>
      {showCal ? (
        <DateField
          label="Go to date"
          value={date}
          onChange={(d) => {
            if (d) onDate(d);
            setShowCal(false);
          }}
          today={today}
          allowNone={false}
          initiallyOpen
        />
      ) : null}

      <View className="my-3">
        <StatusPicker date={date} today={today} entry={entry} defaultMinutes={defaultMinutes} />
      </View>
      {isLoading ? <P className="text-sm">Loading…</P> : null}
      {!isLoading && !entry ? <P className="text-center text-sm">Not marked{date > today ? ' · future days: Off or Sick Leave only' : ''}</P> : null}
      {entry ? <EntryDetails key={`${date}:${entry.status}`} entry={entry} /> : null}
    </Card>
  );
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Hours + note for one entry, auto-saved 600 ms after the last change. */
function EntryDetails({ entry }: { entry: Attendance }) {
  const [work, setWork] = useState(entry.workMinutes);
  const [ot, setOt] = useState(entry.overtimeMinutes);
  const [note, setNote] = useState(entry.note);
  const [state, setState] = useState<SaveState>('idle');
  const latest = useRef(entry);
  latest.current = entry;

  const tooMuch = work + ot > 24 * 60;
  const changed = work !== entry.workMinutes || ot !== entry.overtimeMinutes || note.trim() !== entry.note;

  useEffect(() => {
    if (!changed || tooMuch) return;
    setState('saving');
    const t = setTimeout(async () => {
      const ok = await saveAttendance({ ...latest.current, workMinutes: work, overtimeMinutes: ot, note: note.trim() });
      setState(ok ? 'saved' : 'error');
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [work, ot, note]); // only user edits trigger a save (entry is read via the ref)

  return (
    <View>
      {entry.status === 'present' ? (
        <>
          <HoursRow label="Working hours" minutes={work} max={24} onChange={setWork} />
          <HoursRow label="Overtime hours" minutes={ot} max={16} onChange={setOt} />
          {tooMuch ? (
            <Text accessibilityRole="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
              Working + overtime can be at most 24 h (now {formatHours(work + ot)} h). Not saved.
            </Text>
          ) : null}
        </>
      ) : (
        <View className="mb-2 flex-row items-center">
          <View className={`mr-2 h-3 w-3 rounded-full ${STATUS_STYLE[entry.status].cell}`} />
          <P className="text-sm">{STATUS_LABEL[entry.status]} · 0 h</P>
        </View>
      )}
      <TextInput
        accessibilityLabel="Note for this day"
        value={note}
        onChangeText={setNote}
        maxLength={200}
        placeholder="Note (optional), e.g. Site visit"
        placeholderTextColor="#94a3b8"
        className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />
      <Text accessibilityLiveRegion="polite" className={`mt-1 text-right text-xs ${state === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
        {tooMuch ? '' : state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : state === 'error' ? 'Not saved — try again' : ''}
      </Text>
    </View>
  );
}

/** "Working hours: 8 h ✎" — the pencil opens a 0.5 h stepper with a typed input. */
function HoursRow({ label, minutes, max, onChange }: { label: string; minutes: number; max: number; onChange: (m: number) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(formatHours(minutes));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setText(formatHours(minutes)), [minutes]);

  const set = (m: number) => onChange(Math.min(max * 60, Math.max(0, m)));
  const typed = (t: string) => {
    setText(t);
    const h = Number(t);
    if (t.trim() === '' || Number.isNaN(h)) return setErr('Enter a number of hours');
    if (h < 0 || h > max) return setErr(`0–${max} h`);
    if ((h * 2) % 1 !== 0) return setErr('Use 0.5 h steps (e.g. 7.5)');
    setErr(null);
    onChange(h * 60);
  };

  return (
    <View className="mb-2">
      <View className="min-h-11 flex-row items-center justify-between">
        <Text className="text-base text-slate-900 dark:text-white">
          {label}: <Text className="font-bold">{formatHours(minutes)} h</Text>
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${label.toLowerCase()}`} onPress={() => setOpen((o) => !o)} className="h-11 w-11 items-center justify-center rounded-full">
          <Text className="text-lg text-brand dark:text-brand-light">{open ? '✓' : '✎'}</Text>
        </Pressable>
      </View>
      {open ? (
        <View className="flex-row items-center gap-3">
          <StepBtn label={`${label} minus half an hour`} text="−" disabled={minutes <= 0} onPress={() => set(minutes - 30)} />
          <TextInput
            accessibilityLabel={`${label} in hours`}
            value={text}
            onChangeText={typed}
            keyboardType="decimal-pad"
            className="min-h-12 w-20 rounded-xl border border-slate-300 bg-white text-center text-lg text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <StepBtn label={`${label} plus half an hour`} text="+" primary disabled={minutes >= max * 60} onPress={() => set(minutes + 30)} />
          <Text className="text-xs text-slate-500">0–{max} h</Text>
        </View>
      ) : null}
      {err ? <Text className="text-xs text-red-600 dark:text-red-400">{err}</Text> : null}
    </View>
  );
}
