import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/stores/auth';
import { showError } from '@/stores/toast';
import { api } from './api';
import { queryClient } from './queryClient';

export type Collection =
  | 'tasks'
  | 'time-sessions'
  | 'daily-logs'
  | 'habits'
  | 'habit-entries'
  | 'accounts'
  | 'categories'
  | 'transactions'
  | 'recurring';
interface Rec {
  clientId: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const nowIso = () => new Date().toISOString();
export const newId = () => Crypto.randomUUID();

/** Sync fields for a brand-new record. */
export function newBase() {
  const now = nowIso();
  return { clientId: newId(), createdAt: now, updatedAt: now, deletedAt: null };
}

export function useList<T extends Rec>(c: Collection) {
  const signedIn = useAuth((s) => s.status === 'signedIn');
  return useQuery({
    queryKey: [c],
    queryFn: async () => (await api<{ items: T[] }>(`/${c}`)).items,
    enabled: signedIn,
  });
}

export const getCached = <T extends Rec>(c: Collection) => queryClient.getQueryData<T[]>([c]) ?? [];

/** Optimistic write: the UI updates at once; on failure it rolls back and shows the error. */
async function write<T extends Rec>(c: Collection, apply: (list: T[]) => T[], request: () => Promise<unknown>) {
  await queryClient.cancelQueries({ queryKey: [c] });
  const prev = queryClient.getQueryData<T[]>([c]);
  queryClient.setQueryData<T[]>([c], (l = []) => apply(l));
  try {
    await request();
    return true;
  } catch (e) {
    queryClient.setQueryData([c], prev);
    showError(e);
    return false;
  } finally {
    void queryClient.invalidateQueries({ queryKey: [c] });
  }
}

/** Create or update; pass the full record (updatedAt is stamped here). */
export function saveRecord<T extends Rec>(c: Collection, item: T) {
  const stamped = { ...item, updatedAt: nowIso() };
  return write<T>(
    c,
    (l) => (l.some((x) => x.clientId === stamped.clientId) ? l.map((x) => (x.clientId === stamped.clientId ? stamped : x)) : [...l, stamped]),
    () => api(`/${c}/${stamped.clientId}`, { method: 'PUT', body: stamped }),
  );
}

export function removeRecord<T extends Rec>(c: Collection, clientId: string) {
  return write<T>(
    c,
    (l) => l.filter((x) => x.clientId !== clientId),
    () => api(`/${c}/${clientId}`, { method: 'DELETE' }),
  );
}
