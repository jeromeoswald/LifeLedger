import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  localDate,
  localTime,
  parseDate,
  taskSchema,
  weekday,
  zonedToInstant,
  type Alarm,
  type Priority,
  type Task,
  type TaskStatus,
} from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { Button, ErrorText, Field, P, Screen, SectionTitle, Segmented, fieldErrors } from '@/components/ui';
import { Chip, DateField } from '@/components/DateField';
import { PRIORITY_STYLE, STATUS_LABEL } from '@/lib/format';
import { newBase, newId, saveRecord } from '@/lib/records';
import { deleteTask, projectsOf, useTasks, useToday } from '@/lib/work';
import { ensureAlarmPermission } from '@/lib/alarms';

type Freq = 'none' | 'daily' | 'weekly' | 'monthly';
interface AlarmDraft {
  id: string;
  kind: 'at' | 'before';
  date: string;
  time: string;
  minutesBefore: number;
  style: 'reminder' | 'alarm';
}

const WEEKDAY_CHIPS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ d, label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]! }));
const BEFORE = [0, 5, 10, 15, 30, 60];
const ESTIMATES = [15, 30, 60, 90, 120];

export default function TaskEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tz = useAuth((s) => s.user?.timeZone ?? 'Asia/Dubai');
  const today = useToday(tz);
  const { data: tasks, isLoading } = useTasks();
  const existing = tasks?.find((t) => t.clientId === id);

  if (id !== 'new' && !existing) {
    return (
      <Screen>
        <P>{isLoading ? 'Loading…' : 'This task no longer exists.'}</P>
      </Screen>
    );
  }
  return <Editor key={id} existing={existing} tasks={tasks ?? []} tz={tz} today={today} />;
}

function Editor({ existing, tasks, tz, today }: { existing?: Task; tasks: Task[]; tz: string; today: string }) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [project, setProject] = useState(existing?.project ?? '');
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium');
  const [status, setStatus] = useState<TaskStatus>(existing?.status ?? 'todo');
  const [dueDate, setDueDate] = useState<string | null>(existing ? existing.dueDate : today);
  const [dueTime, setDueTime] = useState(existing?.dueTime ?? '');
  const [estimate, setEstimate] = useState(existing?.estimateMin ? String(existing.estimateMin) : '');
  const [freq, setFreq] = useState<Freq>(existing?.recurrence?.freq ?? 'none');
  const [interval, setInterval_] = useState(String(existing?.recurrence?.interval ?? 1));
  const [weekdays, setWeekdays] = useState<number[]>(existing?.recurrence?.weekdays ?? []);
  const [alarms, setAlarms] = useState<AlarmDraft[]>(() =>
    (existing?.alarms ?? []).map((a) => ({
      id: a.id,
      kind: a.kind,
      date: a.at ? localDate(new Date(a.at), tz) : today,
      time: a.at ? localTime(new Date(a.at), tz) : '09:00',
      minutesBefore: a.minutesBefore ?? 15,
      style: a.style,
    })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [permNote, setPermNote] = useState<string | null>(null);

  const projects = projectsOf(tasks);
  const updateAlarm = (aid: string, patch: Partial<AlarmDraft>) =>
    setAlarms((l) => l.map((a) => (a.id === aid ? { ...a, ...patch } : a)));

  const addAlarm = async () => {
    setAlarms((l) => [
      ...l,
      { id: newId(), kind: dueDate && dueTime ? 'before' : 'at', date: dueDate ?? today, time: dueTime || '09:00', minutesBefore: 15, style: 'reminder' },
    ]);
    if (Platform.OS === 'web') setPermNote('Alarms ring on your phone. Browser notifications arrive in a later update.');
    else if (!(await ensureAlarmPermission())) setPermNote('Notifications are off for LifeLedger. Turn them on in system settings for alarms to ring.');
  };

  const save = async () => {
    const draftErrors: Record<string, string> = {};
    const toAlarm = (a: AlarmDraft): Alarm | null => {
      if (a.kind === 'before') return { id: a.id, kind: 'before', at: null, minutesBefore: a.minutesBefore, style: a.style };
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time)) {
        draftErrors.alarms = 'Alarm times use HH:MM, e.g. 08:30';
        return null;
      }
      return { id: a.id, kind: 'at', at: zonedToInstant(a.date, a.time, tz).toISOString(), minutesBefore: null, style: a.style };
    };
    const builtAlarms = alarms.map(toAlarm).filter((a): a is Alarm => a !== null);
    const finished = status === 'done';
    const candidate = {
      ...(existing ?? newBase()),
      title,
      notes,
      project: project.trim(),
      priority,
      status,
      dueDate,
      dueTime: dueDate && dueTime ? dueTime : null,
      estimateMin: estimate ? Number(estimate) : null,
      recurrence:
        freq === 'none'
          ? null
          : {
              freq,
              interval: Number(interval) || 1,
              weekdays: freq === 'weekly' ? weekdays : [],
              monthDay: freq === 'monthly' && dueDate ? parseDate(dueDate).d : null,
            },
      alarms: builtAlarms,
      completedAt: finished ? (existing?.completedAt ?? new Date().toISOString()) : null,
    };
    const parsed = taskSchema.safeParse(candidate);
    const errs = { ...draftErrors, ...(parsed.success ? {} : fieldErrors(parsed.error.issues)) };
    setErrors(errs);
    if (!parsed.success || Object.keys(errs).length) return;
    setBusy(true);
    const ok = await saveRecord('tasks', parsed.data);
    setBusy(false);
    if (ok) router.back();
  };

  return (
    <Screen>
      <Field label="Title" value={title} onChangeText={setTitle} error={errors.title} autoFocus={!existing} placeholder="What needs doing?" />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline className="min-h-20 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />

      <Field label="Project" value={project} onChangeText={setProject} placeholder="e.g. Work" error={errors.project} />
      {projects.length ? (
        <View className="-mt-2 mb-4 flex-row flex-wrap gap-2">
          {projects.map((p) => (
            <Chip key={p} text={p} selected={p === project} onPress={() => setProject(p)} />
          ))}
        </View>
      ) : null}

      <SectionTitle>Priority</SectionTitle>
      <Segmented
        label="Priority"
        value={priority}
        onChange={setPriority}
        options={(['low', 'medium', 'high', 'urgent'] as const).map((v) => ({ value: v, label: PRIORITY_STYLE[v].label }))}
      />
      <SectionTitle>Status</SectionTitle>
      <Segmented
        label="Status"
        value={status}
        onChange={setStatus}
        options={(['todo', 'in_progress', 'blocked', 'done'] as const).map((v) => ({ value: v, label: STATUS_LABEL[v] }))}
      />

      <DateField label="Due date" value={dueDate} onChange={setDueDate} today={today} />
      {dueDate ? (
        <Field
          label="Due time (optional, 24h)"
          value={dueTime}
          onChangeText={(t) => setDueTime(t.replace(/[^\d:]/g, '').slice(0, 5))}
          placeholder="HH:MM"
          keyboardType="numbers-and-punctuation"
          error={errors.dueTime}
        />
      ) : null}

      <SectionTitle>Estimate</SectionTitle>
      <View className="mb-4 flex-row flex-wrap items-end gap-2">
        {ESTIMATES.map((m) => (
          <Chip key={m} text={m < 60 ? `${m}m` : `${m / 60}h`} selected={estimate === String(m)} onPress={() => setEstimate(estimate === String(m) ? '' : String(m))} />
        ))}
        <View className="w-28">
          <Field label="Minutes" value={estimate} onChangeText={(t) => setEstimate(t.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" error={errors.estimateMin} />
        </View>
      </View>

      <SectionTitle>Repeat</SectionTitle>
      <Segmented
        label="Repeat"
        value={freq}
        onChange={(f) => {
          setFreq(f);
          if (f === 'weekly' && !weekdays.length && dueDate) setWeekdays([weekday(dueDate)]);
        }}
        options={[
          { value: 'none', label: 'Never' },
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
        ]}
      />
      {freq !== 'none' ? (
        <>
          <View className="w-40">
            <Field
              label={`Every N ${freq === 'daily' ? 'days' : freq === 'weekly' ? 'weeks' : 'months'}`}
              value={interval}
              onChangeText={(t) => setInterval_(t.replace(/\D/g, '').slice(0, 3))}
              keyboardType="number-pad"
            />
          </View>
          {freq === 'weekly' ? (
            <View className="mb-4 flex-row flex-wrap gap-2">
              {WEEKDAY_CHIPS.map(({ d, label }) => (
                <Chip
                  key={d}
                  text={label}
                  selected={weekdays.includes(d)}
                  onPress={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                />
              ))}
            </View>
          ) : null}
          <ErrorText>{errors.recurrence}</ErrorText>
        </>
      ) : null}

      <SectionTitle>Alarms</SectionTitle>
      {alarms.map((a) => (
        <View key={a.id} className="mb-3 rounded-2xl bg-white p-3 dark:bg-slate-900">
          <Segmented
            label="Alarm type"
            value={a.kind}
            onChange={(kind) => updateAlarm(a.id, { kind })}
            options={[
              { value: 'before', label: 'Before due' },
              { value: 'at', label: 'At a time' },
            ]}
          />
          {a.kind === 'before' ? (
            <View className="mb-2 flex-row flex-wrap gap-2">
              {BEFORE.map((m) => (
                <Chip key={m} text={m ? `${m} min` : 'At due time'} selected={a.minutesBefore === m} onPress={() => updateAlarm(a.id, { minutesBefore: m })} />
              ))}
            </View>
          ) : (
            <>
              <DateField label="Date" value={a.date} onChange={(d) => updateAlarm(a.id, { date: d ?? today })} today={today} allowNone={false} />
              <View className="w-32">
                <Field label="Time (24h)" value={a.time} onChangeText={(t) => updateAlarm(a.id, { time: t.replace(/[^\d:]/g, '').slice(0, 5) })} placeholder="HH:MM" />
              </View>
            </>
          )}
          <Segmented
            label="Alarm style"
            value={a.style}
            onChange={(style) => updateAlarm(a.id, { style })}
            options={[
              { value: 'reminder', label: 'Reminder' },
              { value: 'alarm', label: 'Alarm (loud, repeats)' },
            ]}
          />
          <Pressable accessibilityRole="button" onPress={() => setAlarms((l) => l.filter((x) => x.id !== a.id))} className="min-h-11 justify-center self-start">
            <Text className="text-red-600 dark:text-red-400">Remove alarm</Text>
          </Pressable>
        </View>
      ))}
      <ErrorText>{errors.alarms}</ErrorText>
      {permNote ? <P className="mb-2 text-sm">{permNote}</P> : null}
      {alarms.length < 10 ? <Button title="+ Add alarm" variant="secondary" onPress={() => void addAlarm()} className="mb-6" /> : null}

      <Button title={existing ? 'Save changes' : 'Add task'} onPress={() => void save()} loading={busy} />
      {existing ? (
        <Button
          title="Delete task"
          variant="ghost"
          className="mt-2"
          onPress={async () => {
            if (await deleteTask(existing)) router.back();
          }}
        />
      ) : null}
    </Screen>
  );
}
