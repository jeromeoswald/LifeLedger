import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/stores/auth';
import { showError } from '@/stores/toast';
import { queryClient } from './queryClient';
import { localStore } from './store/localStore';
import type { Rec as StoreRec } from './store/types';
import { queueWrite } from './sync';

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

/** Live records from the device's store (works offline; sync refreshes it in the background). */
export function useList<T extends Rec>(c: Collection) {
  const signedIn = useAuth((s) => s.status === 'signedIn');
  return useQuery({
    queryKey: [c],
    queryFn: async () => (await localStore.all(c)).filter((r) => !r.deletedAt) as unknown as T[],
    enabled: signedIn,
    staleTime: Infinity, // changes arrive through writes and sync, which update/invalidate this
  });
}

export const getCached = <T extends Rec>(c: Collection) => queryClient.getQueryData<T[]>([c]) ?? [];

/** Local-first write: the device store + sync queue first, then the UI; sync pushes it when online. */
async function write<T extends Rec>(c: Collection, rec: T) {
  try {
    await queueWrite(c, rec as unknown as StoreRec);
    queryClient.setQueryData<T[]>([c], (l = []) => {
      const rest = l.filter((x) => x.clientId !== rec.clientId);
      return rec.deletedAt ? rest : [...rest, rec];
    });
    return true;
  } catch (e) {
    showError(e); // only if the device store itself fails
    return false;
  }
}

/** Create or update; pass the full record (updatedAt is stamped here). */
export function saveRecord<T extends Rec>(c: Collection, item: T) {
  return write(c, { ...item, updatedAt: nowIso() });
}

/** Soft delete: a tombstone that sync carries to the other devices. */
export async function removeRecord<T extends Rec>(c: Collection, clientId: string) {
  const current = getCached<T>(c).find((x) => x.clientId === clientId) ?? ((await localStore.get(c, clientId)) as unknown as T | null);
  if (!current) return true;
  const now = nowIso();
  return write(c, { ...current, deletedAt: now, updatedAt: now });
}
