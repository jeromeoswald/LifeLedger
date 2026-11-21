import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { habitStats } from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { P, Screen, SectionTitle, Segmented } from '@/components/ui';
import { Fab } from '@/components/Fab';
import { HabitCard } from '@/components/habits/HabitCard';
import { useHabitEntries, useHabits } from '@/lib/habits';

export default function Habits() {
  const tz = useAuth((s) => s.user?.timeZone ?? 'Asia/Dubai');
  const { data: habits = [], isLoading } = useHabits();
  const { data: entries = [] } = useHabitEntries();
  const [show, setShow] = useState<'active' | 'archived'>('active');
  const now = new Date();

  const list = habits
    .filter((h) => (show === 'active' ? !h.archivedAt : !!h.archivedAt))
    .map((h) => ({ h, s: habitStats(h, entries, now, tz) }));
  const due = list.filter((x) => x.s.dueToday);
  const rest = list.filter((x) => !x.s.dueToday);
  const card = ({ h, s }: (typeof list)[number]) => <HabitCard key={h.clientId} habit={h} entries={entries} stats={s} />;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <Screen>
        <Segmented
          label="Which habits"
          value={show}
          onChange={setShow}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
        {isLoading ? <P>Loading…</P> : null}
        {!isLoading && !list.length ? (
          <P>{show === 'active' ? 'No habits yet. Tap + to start one.' : 'No archived habits.'}</P>
        ) : null}
        {show === 'active' && due.length ? <SectionTitle>To do today · {due.length}</SectionTitle> : null}
        {due.map(card)}
        {show === 'active' && due.length && rest.length ? <SectionTitle>Done or not due</SectionTitle> : null}
        {rest.map(card)}
        <View className="h-20" />
      </Screen>
      <Fab label="Add habit" onPress={() => router.push({ pathname: '/habit/[id]', params: { id: 'new' } })} />
    </View>
  );
}
