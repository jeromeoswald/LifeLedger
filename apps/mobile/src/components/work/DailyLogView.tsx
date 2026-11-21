import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { addDays, formatDuration, localDate, workReport } from '@lifeledger/shared';
import { Button, Card, Field, P, SectionTitle } from '@/components/ui';
import { NavBtn } from '@/components/DateField';
import { relativeDay } from '@/lib/format';
import { saveDailyLog, useDailyLogs } from '@/lib/work';
import type { WorkCtx } from './types';

const multiline = {
  multiline: true,
  className:
    'min-h-24 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white',
};

export function DailyLogView({ tasks, sessions, tz, today }: WorkCtx) {
  const [date, setDate] = useState(today);
  const logs = useDailyLogs();
  const log = logs.data?.find((l) => l.date === date);
  const [form, setForm] = useState({ done: '', blockers: '', tomorrow: '' });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({ done: log?.done ?? '', blockers: log?.blockers ?? '', tomorrow: log?.tomorrow ?? '' });
    setSaved(false);
  }, [date, log?.clientId, log?.updatedAt]); // reset the form only when the date or the saved log changes

  const completed = tasks.filter((t) => t.status === 'done' && t.completedAt && localDate(new Date(t.completedAt), tz) === date);
  const tracked = workReport(tasks, sessions, date, date, tz, new Date()).totalSeconds;
  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <NavBtn label="Previous day" text="‹" onPress={() => setDate(addDays(date, -1))} />
        <Text className="text-lg font-semibold text-slate-900 dark:text-white">{relativeDay(date, today)}</Text>
        <NavBtn label="Next day" text="›" onPress={() => date < today && setDate(addDays(date, 1))} />
      </View>

      <Card>
        <Text className="font-semibold text-slate-900 dark:text-white">
          {completed.length} done · {formatDuration(tracked)} tracked
        </Text>
        {completed.map((t) => (
          <P key={t.clientId} className="mt-1 text-sm">
            ✓ {t.title}
          </P>
        ))}
      </Card>

      <SectionTitle>Notes for {relativeDay(date, today).toLowerCase()}</SectionTitle>
      <Field label="What got done" value={form.done} onChangeText={set('done')} {...multiline} />
      <Field label="Blockers" value={form.blockers} onChangeText={set('blockers')} {...multiline} />
      <Field label="Plan for tomorrow" value={form.tomorrow} onChangeText={set('tomorrow')} {...multiline} />
      <Button
        title={saved ? 'Saved ✓' : 'Save log'}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setSaved(await saveDailyLog(date, form));
          setBusy(false);
        }}
      />
    </View>
  );
}
