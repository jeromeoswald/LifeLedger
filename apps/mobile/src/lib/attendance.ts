import { useQuery } from '@tanstack/react-query';
import type { Attendance, AttendanceStatus } from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { showError, useToast } from '@/stores/toast';
import { queryClient } from './queryClient';
import { newBase, nowIso } from './records';
import { localStore } from './store/localStore';
import type { Rec } from './store/types';
import { queueWrite } from './sync';

type Key = readonly ['attendance', string, string];
const keyOf = (from: string, to: string): Key => ['attendance', from, to];

/** Live entries in [from, to] from the device store. Each range is its own cached query; saves patch all of them. */
export function useAttendance(from: string, to: string) {
  const signedIn = useAuth((s) => s.status === 'signedIn');
  return useQuery({
    queryKey: keyOf(from, to),
    queryFn: async () =>
      (await localStore.all('attendance')).filter((e) => !e.deletedAt && String(e.date) >= from && String(e.date) <= to) as unknown as Attendance[],
    enabled: signedIn,
    staleTime: Infinity,
  });
}

/** Applies `fn` to every cached range that contains `date`. */
function patchCaches(date: string, fn: (list: Attendance[]) => Attendance[]) {
  for (const [key, list] of queryClient.getQueriesData<Attendance[]>({ queryKey: ['attendance'] })) {
    const [, from, to] = key as unknown as Key;
    if (list && from <= date && date <= to) queryClient.setQueryData(key, fn(list));
  }
}

/** Local-first upsert by date (works offline; sync pushes it). */
export async function saveAttendance(entry: Attendance): Promise<boolean> {
  const stamped = { ...entry, updatedAt: nowIso(), deletedAt: null };
  try {
    await queueWrite('attendance', stamped as unknown as Rec);
    patchCaches(entry.date, (l) => [...l.filter((e) => e.date !== entry.date), stamped]);
    return true;
  } catch (e) {
    showError(e);
    return false;
  }
}

/** Soft delete (tombstone) so other devices drop the day too. */
export async function deleteAttendance(date: string): Promise<boolean> {
  const current = await localStore.get('attendance', date);
  if (!current) return true;
  const now = nowIso();
  try {
    await queueWrite('attendance', { ...current, deletedAt: now, updatedAt: now });
    patchCaches(date, (l) => l.filter((e) => e.date !== date));
    return true;
  } catch (e) {
    showError(e);
    return false;
  }
}

/** A full entry for `date` with the given status; hours only for Present (default hours for a new Present day). */
export function entryWithStatus(date: string, status: AttendanceStatus, current: Attendance | undefined, defaultMinutes: number): Attendance {
  const present = status === 'present';
  return {
    ...(current ?? { ...newBase(), note: '' }),
    date,
    status,
    workMinutes: present ? (current?.status === 'present' ? current.workMinutes : defaultMinutes) : 0,
    overtimeMinutes: present && current?.status === 'present' ? current.overtimeMinutes : 0,
  } as Attendance;
}

/** Status change with a 5 s "Saved · Undo" toast that restores the previous entry (or removes a new one). */
export async function setStatusWithUndo(next: Attendance, previous: Attendance | undefined) {
  if (!(await saveAttendance(next))) return;
  useToast.getState().show(`Saved: ${next.status === 'sick' ? 'Sick Leave' : next.status[0]!.toUpperCase() + next.status.slice(1)}`, {
    tone: 'info',
    durationMs: 5000,
    action: { label: 'Undo', onPress: () => void (previous ? saveAttendance(previous) : deleteAttendance(next.date)) },
  });
}
