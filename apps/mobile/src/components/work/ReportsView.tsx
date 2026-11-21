import { useState } from 'react';
import { Text, View } from 'react-native';
import { formatDuration, parseDate, periodRange, shiftPeriod, workReport, type Period } from '@lifeledger/shared';
import { Card, P, SectionTitle, Segmented } from '@/components/ui';
import { NavBtn } from '@/components/DateField';
import { formatDate, formatMonth, relativeDay } from '@/lib/format';
import { useNow } from '@/lib/work';
import type { WorkCtx } from './types';

// Bars are plain Views: they look the same on web, iOS and Android without a chart dependency.
export function ReportsView({ tasks, sessions, tz, today, runningTaskId }: WorkCtx) {
  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState(today);
  const now = useNow(!!runningTaskId);
  const { start, end } = periodRange(period, anchor);
  const r = workReport(tasks, sessions, start, end, tz, now);
  const maxSec = Math.max(1, ...r.days.map((d) => d.seconds));
  const maxProj = Math.max(1, ...r.projects.map((p) => p.seconds));

  const label =
    period === 'day' ? relativeDay(start, today) : period === 'week' ? `${formatDate(start)} – ${formatDate(end)}` : formatMonth(start);

  return (
    <View>
      <Segmented
        label="Report period"
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setAnchor(today);
        }}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />
      <View className="mb-3 flex-row items-center justify-between">
        <NavBtn label="Previous period" text="‹" onPress={() => setAnchor(shiftPeriod(period, anchor, -1))} />
        <Text className="text-lg font-semibold text-slate-900 dark:text-white">{label}</Text>
        <NavBtn label="Next period" text="›" onPress={() => end < today && setAnchor(shiftPeriod(period, anchor, 1))} />
      </View>

      <View className="flex-row gap-3">
        <Card className="flex-1">
          <P className="text-sm">Tasks done</P>
          <Text className="text-3xl font-bold text-slate-900 dark:text-white">{r.totalDone}</Text>
        </Card>
        <Card className="flex-1">
          <P className="text-sm">Time tracked</P>
          <Text className="text-3xl font-bold text-slate-900 dark:text-white">{formatDuration(r.totalSeconds)}</Text>
        </Card>
      </View>

      {period !== 'day' ? (
        <>
          <SectionTitle>Hours per day</SectionTitle>
          <Card>
            <View className="h-40 flex-row gap-1" accessibilityLabel="Hours per day chart">
              {r.days.map((d) => (
                <View key={d.date} className="flex-1 items-center justify-end">
                  {d.done ? <Text className="text-[10px] text-slate-500">{d.done}✓</Text> : null}
                  <View
                    accessibilityLabel={`${d.date}: ${formatDuration(d.seconds)}, ${d.done} done`}
                    className={`w-full rounded-t ${d.date === today ? 'bg-brand' : 'bg-teal-300 dark:bg-teal-700'}`}
                    style={{ height: `${Math.max(d.seconds ? 4 : 1, (d.seconds / maxSec) * 85)}%` }}
                  />
                </View>
              ))}
            </View>
            <View className="mt-1 flex-row gap-1">
              {r.days.map((d, i) => (
                <Text key={d.date} className="flex-1 text-center text-[10px] text-slate-500">
                  {period === 'week' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i] : i % 5 === 0 ? parseDate(d.date).d : ''}
                </Text>
              ))}
            </View>
          </Card>
        </>
      ) : null}

      <SectionTitle>By project</SectionTitle>
      <Card>
        {r.projects.length ? (
          r.projects.map((p) => (
            <View key={p.project} className="mb-3">
              <View className="flex-row justify-between">
                <Text className="font-medium text-slate-900 dark:text-white">{p.project}</Text>
                <Text className="text-slate-600 dark:text-slate-300">
                  {p.done} done · {formatDuration(p.seconds)}
                </Text>
              </View>
              <View className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <View className="h-2 rounded-full bg-brand" style={{ width: `${(p.seconds / maxProj) * 100}%` }} />
              </View>
            </View>
          ))
        ) : (
          <P>No completed tasks or tracked time in this period.</P>
        )}
      </Card>
    </View>
  );
}
