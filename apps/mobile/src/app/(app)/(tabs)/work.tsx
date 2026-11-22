import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/stores/auth';
import { Screen, Segmented } from '@/components/ui';
import { Fab } from '@/components/Fab';
import { TimerBar } from '@/components/work/TimerBar';
import { TodayView } from '@/components/work/TodayView';
import { AllTasksView } from '@/components/work/AllTasksView';
import { DailyLogView } from '@/components/work/DailyLogView';
import { ReportsView } from '@/components/work/ReportsView';
import { DayEntry } from '@/components/attendance/DayEntry';
import { AttendanceReport } from '@/components/attendance/AttendanceReport';
import { runningSession, useSessions, useTasks, useToday } from '@/lib/work';

type Section = 'tasks' | 'attendance';
type Tab = 'today' | 'all' | 'log' | 'reports';

export default function Work() {
  const params = useLocalSearchParams<{ section?: Section }>();
  const [section, setSection] = useState<Section>(params.section === 'attendance' ? 'attendance' : 'tasks');
  const [tab, setTab] = useState<Tab>('today');
  const user = useAuth((s) => s.user);
  const tz = user?.timeZone ?? 'Asia/Dubai';
  const today = useToday(tz);
  const [day, setDay] = useState(today);
  const tasks = useTasks();
  const sessions = useSessions();
  const running = runningSession(sessions.data);
  const ctx = { tasks: tasks.data ?? [], sessions: sessions.data ?? [], tz, today, runningTaskId: running?.taskId, loading: tasks.isLoading };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <Screen>
        <Segmented
          label="Work section"
          value={section}
          onChange={setSection}
          options={[
            { value: 'tasks', label: '📋 Tasks' },
            { value: 'attendance', label: '🗓️ Attendance' },
          ]}
        />
        {section === 'tasks' ? (
          <>
            <Segmented
              label="Task view"
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
          </>
        ) : (
          <>
            <DayEntry date={day} onDate={setDay} today={today} defaultMinutes={user?.attendanceDefaultMinutes ?? 480} />
            <AttendanceReport selected={day} onSelect={setDay} today={today} weekStart={user?.weekStart ?? 1} />
          </>
        )}
        <View className="h-20" />
      </Screen>
      {section === 'tasks' && (tab === 'today' || tab === 'all') ? (
        <Fab label="Add task" onPress={() => router.push({ pathname: '/task/[id]', params: { id: 'new' } })} />
      ) : null}
    </View>
  );
}
