import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { alarmTime, type Habit, type Task } from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { queryClient } from './queryClient';
import { setTaskDone } from './work';

// Native local notifications for task alarms. Web Push, Android exact alarms and the full-screen
// ringing alarm need a server scheduler / dev build and arrive in Phase 6.
const native = Platform.OS !== 'web';
const PREFIX = 'task:';
const HABIT_PREFIX = 'habit:';
const MAX_SCHEDULED = 40; // iOS keeps at most 64 pending notifications; the rest is left for habit reminders
const ALARM_REPEATS = 2; // "Alarm" style re-fires every minute until acted on (approximation, see above)

let setupDone = false;
async function setup() {
  if (!native || setupDone) return;
  setupDone = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Task reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync('alarms', {
      name: 'Task alarms',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 800, 400, 800, 400, 800],
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  // Android shows the first three actions; iOS shows all five on long-press.
  await Notifications.setNotificationCategoryAsync('task', [
    { identifier: 'done', buttonTitle: 'Done', options: { opensAppToForeground: false } },
    { identifier: 'snooze10', buttonTitle: 'Snooze 10 min', options: { opensAppToForeground: false } },
    { identifier: 'open', buttonTitle: 'Open', options: { opensAppToForeground: true } },
    { identifier: 'snooze5', buttonTitle: 'Snooze 5 min', options: { opensAppToForeground: false } },
    { identifier: 'snooze15', buttonTitle: 'Snooze 15 min', options: { opensAppToForeground: false } },
  ]);
}

/** Asks once, when the user adds an alarm. Returns whether alarms can be shown. */
export async function ensureAlarmPermission(): Promise<boolean> {
  if (!native) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } })).granted;
}

function content(task: Task, style: 'reminder' | 'alarm', body: string): Notifications.NotificationContentInput {
  return {
    title: task.title,
    body,
    data: { taskId: task.clientId },
    categoryIdentifier: 'task',
    sound: true,
    interruptionLevel: 'timeSensitive',
    priority: style === 'alarm' ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
  };
}

/** Cancels every task alarm on this device and schedules the upcoming ones from the current task list. */
export async function syncAlarms(tasks: Task[], tz: string) {
  if (!native) return;
  await setup();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  const now = Date.now();
  const jobs = tasks
    .filter((t) => !t.deletedAt && t.status !== 'done')
    .flatMap((t) =>
      t.alarms.flatMap((a) => {
        const when = alarmTime(t, a, tz)?.getTime();
        if (!when) return [];
        const repeats = a.style === 'alarm' ? ALARM_REPEATS : 0;
        return Array.from({ length: repeats + 1 }, (_, i) => ({
          id: `${PREFIX}${t.clientId}:${a.id}${i ? `:r${i}` : ''}`,
          when: when + i * 60_000,
          task: t,
          style: a.style,
          body: a.kind === 'before' ? `Due ${t.dueTime ?? ''}${a.minutesBefore ? ` · in ${a.minutesBefore} min` : ''}` : 'Reminder',
        }));
      }),
    )
    .filter((j) => j.when > now + 1000)
    .sort((a, b) => a.when - b.when)
    .slice(0, MAX_SCHEDULED);

  for (const j of jobs) {
    await Notifications.scheduleNotificationAsync({
      identifier: j.id,
      content: content(j.task, j.style, j.body),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(j.when),
        channelId: j.style === 'alarm' ? 'alarms' : 'reminders',
      },
    });
  }
}

/** One repeating reminder per active habit with a reminder time (weekday habits: one per chosen day). */
export async function syncHabitReminders(habits: Habit[]) {
  if (!native) return;
  await setup();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.identifier.startsWith(HABIT_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  for (const h of habits) {
    if (h.deletedAt || h.archivedAt || !h.reminderTime) continue;
    const [hour, minute] = h.reminderTime.split(':').map(Number) as [number, number];
    const content = { title: h.name, body: 'Time to check in', data: { habitId: h.clientId }, sound: true };
    // shortcut: repeating triggers use the phone's clock, which matches the user's time zone unless they travel.
    if (h.schedule.kind === 'weekdays') {
      for (const d of h.schedule.days) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${HABIT_PREFIX}${h.clientId}:${d}`,
          content,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: d + 1, hour, minute, channelId: 'reminders' },
        });
      }
    } else {
      await Notifications.scheduleNotificationAsync({
        identifier: `${HABIT_PREFIX}${h.clientId}`,
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: 'reminders' },
      });
    }
  }
}

// ---------- responses (Done / Snooze / Open) ----------

function whenSignedIn(fn: () => void) {
  if (useAuth.getState().status === 'signedIn') return fn();
  const unsub = useAuth.subscribe((s) => {
    if (s.status === 'signedIn') {
      unsub();
      fn();
    }
  });
}

async function handleResponse(r: Notifications.NotificationResponse) {
  const req = r.notification.request;
  const data = req.content.data as { taskId?: string; habitId?: string } | undefined;
  if (data?.habitId) {
    const id = data.habitId;
    whenSignedIn(() => router.push({ pathname: '/habit/[id]', params: { id } }));
    return;
  }
  const taskId = data?.taskId;
  if (!taskId) return;
  // Acting on any copy of an "Alarm" silences its remaining repeats.
  const base = req.identifier.replace(/:r\d+$/, '');
  await Promise.all(
    Array.from({ length: ALARM_REPEATS }, (_, i) => Notifications.cancelScheduledNotificationAsync(`${base}:r${i + 1}`)),
  );

  const action = r.actionIdentifier;
  const snooze = /^snooze(\d+)$/.exec(action);
  if (snooze) {
    await Notifications.scheduleNotificationAsync({
      identifier: `snooze:${taskId}:${Date.now()}`,
      content: { ...req.content, body: `Snoozed ${snooze[1]} min`, data: { taskId } } as Notifications.NotificationContentInput,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Number(snooze[1]) * 60 },
    });
    return;
  }
  whenSignedIn(async () => {
    if (action === 'done') {
      const tasks = await queryClient.ensureQueryData<Task[]>({ queryKey: ['tasks'] });
      const task = tasks.find((t) => t.clientId === taskId);
      const tz = useAuth.getState().user?.timeZone ?? 'Asia/Dubai';
      if (task && task.status !== 'done') await setTaskDone(task, true, tz);
    } else {
      router.push({ pathname: '/task/[id]', params: { id: taskId } });
    }
  });
}

/** Mount once in the signed-in layout: keeps alarms in step with tasks and handles actions. */
export function useAlarms(tasks: Task[] | undefined, habits: Habit[] | undefined, tz: string) {
  useEffect(() => {
    if (!native || !habits) return;
    const t = setTimeout(() => void syncHabitReminders(habits).catch(console.warn), 700);
    return () => clearTimeout(t);
  }, [habits]);

  useEffect(() => {
    if (!native) return;
    void setup();
    const sub = Notifications.addNotificationResponseReceivedListener((r) => void handleResponse(r));
    // App opened from a notification while it was closed:
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) {
        void handleResponse(r);
        void Notifications.clearLastNotificationResponseAsync();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!native || !tasks) return;
    const t = setTimeout(() => void syncAlarms(tasks, tz).catch(console.warn), 500);
    return () => clearTimeout(t);
  }, [tasks, tz]);
}
