import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/stores/auth';
import { Screen, Segmented } from '@/components/ui';
import { Fab } from '@/components/Fab';
import { TimerBar } from '@/components/work/TimerBar';
import { TodayView } from '@/components/work/TodayView';
import { AllTasksView } from '@/components/work/AllTasksView';
import { DailyLogView } from '@/components/work/DailyLogView';
import { ReportsView } from '@/components/work/ReportsView';
import { runningSession, useSessions, useTasks, useToday } from '@/lib/work';

type Tab = 'today' | 'all' | 'log' | 'reports';

export default function Work() {
  const [tab, setTab] = useState<Tab>('today');
  const tz = useAuth((s) => s.user?.timeZone ?? 'Asia/Dubai');
  const today = useToday(tz);
  const tasks = useTasks();
  const sessions = useSessions();
  const running = runningSession(sessions.data);
  const ctx = { tasks: tasks.data ?? [], sessions: sessions.data ?? [], tz, today, runningTaskId: running?.taskId, loading: tasks.isLoading };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <Screen>
        <Segmented
          label="Work view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'all', label: 'All tasks' },
            { value: 'log', label: 'Daily log' },
            { value: 'reports', label: 'Reports' },
          ]}
        />
        <TimerBar session={running} task={ctx.tasks.find((t) => t.clientId === running?.taskId)} />
        {tab === 'today' ? <TodayView {...ctx} /> : null}
        {tab === 'all' ? <AllTasksView {...ctx} /> : null}
        {tab === 'log' ? <DailyLogView {...ctx} /> : null}
        {tab === 'reports' ? <ReportsView {...ctx} /> : null}
        <View className="h-20" />
      </Screen>
      {tab === 'today' || tab === 'all' ? (
        <Fab label="Add task" onPress={() => router.push({ pathname: '/task/[id]', params: { id: 'new' } })} />
      ) : null}
    </View>
  );
}
