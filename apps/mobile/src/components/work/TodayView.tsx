import { Text, View } from 'react-native';
import { groupToday, type Task } from '@lifeledger/shared';
import { P, SectionTitle } from '@/components/ui';
import { formatLongDate } from '@/lib/format';
import { TaskRow } from './TaskRow';
import type { WorkCtx } from './types';

export function TodayView({ tasks, tz, today, runningTaskId, loading }: WorkCtx) {
  const g = groupToday(tasks, today, tz);
  const empty = !g.overdue.length && !g.today.length && !g.carryOver.length;
  const section = (title: string, list: Task[], hint?: string) =>
    list.length ? (
      <View>
        <SectionTitle>
          {title} · {list.length}
        </SectionTitle>
        {hint ? <P className="-mt-1 mb-2 text-xs">{hint}</P> : null}
        {list.map((t) => (
          <TaskRow key={t.clientId} task={t} today={today} tz={tz} running={t.clientId === runningTaskId} />
        ))}
      </View>
    ) : null;

  return (
    <View>
      <Text className="text-2xl font-bold text-slate-900 dark:text-white">{formatLongDate(today)}</Text>
      {loading ? <P className="mt-4">Loading tasks…</P> : null}
      {!loading && empty ? <P className="mt-4">Nothing due today. Tap + to add a task.</P> : null}
      {section('Overdue', g.overdue)}
      {section('Today', g.today)}
      {section('Carried over', g.carryOver, 'Started earlier, no due date')}
    </View>
  );
}
