import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { sortTasks, type TaskStatus } from '@lifeledger/shared';
import { P, Segmented } from '@/components/ui';
import { Chip } from '@/components/DateField';
import { projectsOf } from '@/lib/work';
import { TaskRow } from './TaskRow';
import type { WorkCtx } from './types';

type Filter = 'open' | TaskStatus | 'all';

export function AllTasksView({ tasks, tz, today, runningTaskId }: WorkCtx) {
  const [filter, setFilter] = useState<Filter>('open');
  const [project, setProject] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const s = q.trim().toLowerCase();
  const list = sortTasks(
    tasks.filter(
      (t) =>
        (filter === 'all' || (filter === 'open' ? t.status !== 'done' : t.status === filter)) &&
        (!project || t.project === project) &&
        (!s || t.title.toLowerCase().includes(s) || t.notes.toLowerCase().includes(s)),
    ),
  );

  return (
    <View>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search tasks"
        placeholderTextColor="#94a3b8"
        accessibilityLabel="Search tasks"
        className="mb-3 min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />
      <Segmented
        label="Status filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'todo', label: 'To do' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'blocked', label: 'Blocked' },
          { value: 'done', label: 'Done' },
          { value: 'all', label: 'All' },
        ]}
      />
      {projectsOf(tasks).length ? (
        <View className="mb-4 flex-row flex-wrap gap-2">
          <Chip text="All projects" selected={!project} onPress={() => setProject(null)} />
          {projectsOf(tasks).map((p) => (
            <Chip key={p} text={p} selected={project === p} onPress={() => setProject(p)} />
          ))}
        </View>
      ) : null}
      {list.length ? (
        list.map((t) => <TaskRow key={t.clientId} task={t} today={today} tz={tz} running={t.clientId === runningTaskId} />)
      ) : (
        <P>No tasks match.</P>
      )}
    </View>
  );
}
