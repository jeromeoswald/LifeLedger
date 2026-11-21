import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Task } from '@lifeledger/shared';
import { PRIORITY_STYLE, STATUS_LABEL, dueLabel } from '@/lib/format';
import { setTaskDone, startTimer, stopTimer } from '@/lib/work';

export function TaskRow({
  task,
  today,
  tz,
  running,
  showTimer = true,
}: {
  task: Task;
  today: string;
  tz: string;
  running: boolean;
  showTimer?: boolean;
}) {
  const done = task.status === 'done';
  const due = dueLabel(task, today);
  const overdue = !done && !!task.dueDate && task.dueDate < today;
  const p = PRIORITY_STYLE[task.priority];

  return (
    <View className="mb-2 min-h-16 flex-row items-center rounded-2xl bg-white pr-1 dark:bg-slate-900">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`Mark ${task.title} ${done ? 'not done' : 'done'}`}
        onPress={() => void setTaskDone(task, !done, tz)}
        className="h-16 w-14 items-center justify-center"
      >
        <View
          className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
            done ? 'border-brand bg-brand' : 'border-slate-400 dark:border-slate-500'
          }`}
        >
          {done ? <Text className="text-xs font-bold text-white">✓</Text> : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${task.title}`}
        onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.clientId } })}
        className="flex-1 py-3"
      >
        <Text
          numberOfLines={2}
          className={`text-base ${done ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}
        >
          {task.title}
        </Text>
        <View className="mt-1 flex-row flex-wrap items-center gap-x-2">
          <View className={`h-2 w-2 rounded-full ${p.dot}`} accessibilityLabel={`${p.label} priority`} />
          {task.project ? <Text className="text-xs text-slate-500 dark:text-slate-400">{task.project}</Text> : null}
          {due ? (
            <Text className={`text-xs ${overdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {due}
            </Text>
          ) : null}
          {task.status === 'in_progress' || task.status === 'blocked' ? (
            <Text className={`text-xs ${task.status === 'blocked' ? 'text-amber-600' : 'text-teal-600 dark:text-teal-400'}`}>
              {STATUS_LABEL[task.status]}
            </Text>
          ) : null}
          {task.estimateMin ? <Text className="text-xs text-slate-500 dark:text-slate-400">~{task.estimateMin}m</Text> : null}
          {task.recurrence ? <Text accessibilityLabel="Repeats" className="text-xs text-slate-500">↻</Text> : null}
          {task.alarms.length ? <Text accessibilityLabel="Has alarm" className="text-xs">⏰</Text> : null}
        </View>
      </Pressable>

      {showTimer && !done ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={running ? `Stop timer for ${task.title}` : `Start timer for ${task.title}`}
          onPress={() => void (running ? stopTimer() : startTimer(task))}
          className={`h-11 w-11 items-center justify-center rounded-full ${running ? 'bg-red-100 dark:bg-red-950' : ''}`}
        >
          <Text className={`text-lg ${running ? 'text-red-600' : 'text-brand dark:text-brand-light'}`}>{running ? '■' : '▶'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
