import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import type { User } from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { showError } from '@/stores/toast';
import { ApiError, api, setOnSignedIn } from './api';
import { queryClient } from './queryClient';
import { localStore } from './store/localStore';
import { keyOf, type QueueItem, type Rec } from './store/types';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export const useSync = create<{ status: SyncStatus; pending: number }>(() => ({ status: 'synced', pending: 0 }));

const BATCH = 500;
const RETRY_MS = 30_000;
const INTERVAL_MS = 5 * 60_000;

interface SyncResponse {
  serverTime: string;
  changes: Record<string, Rec[]>;
  rejected: { collection: string; key: string; error: string; current: Rec | null }[];
  user: User;
}

export const refreshPending = async () => useSync.setState({ pending: (await localStore.queued()).length });

/** Saves server records locally unless the local copy is newer (it will be pushed next). Returns true if anything changed. */
async function applyIncoming(collection: string, incoming: Rec[]) {
  const local = new Map((await localStore.all(collection)).map((r) => [keyOf(collection, r), r]));
  const puts = incoming
    .filter((r) => {
      const mine = local.get(keyOf(collection, r));
      return !mine || mine.updatedAt <= r.updatedAt;
    })
    .map((rec) => ({ key: keyOf(collection, rec), rec }));
  if (puts.length) await localStore.putMany(collection, puts);
  return puts.length > 0;
}

async function once() {
  const queue = await localStore.queued();
  useSync.setState({ status: 'syncing', pending: queue.length });
  let cursor = await localStore.getMeta('lastSyncedAt');
  const settingsRaw = await localStore.getMeta('pendingSettings');
  const touched = new Set<string>();
  let user: User | null = null;

  // at least one round (to pull), more if the queue is long
  for (let i = 0; i === 0 || i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);
    const changes: Record<string, Rec[]> = {};
    for (const q of batch) (changes[q.collection] ??= []).push(q.rec);
    const res = await api<SyncResponse>('/sync', {
      method: 'POST',
      body: { lastSyncedAt: cursor, changes, settings: i === 0 && settingsRaw ? JSON.parse(settingsRaw) : null },
    });

    for (const [c, recs] of Object.entries(res.changes)) if (await applyIncoming(c, recs)) touched.add(c);
    for (const r of res.rejected) {
      // the server refused this change: go back to its copy (or hide a record it never had)
      const sent = batch.find((q) => q.collection === r.collection && q.key === r.key);
      const fallback = r.current ?? (sent ? { ...sent.rec, deletedAt: new Date().toISOString() } : null);
      if (fallback) await localStore.putMany(r.collection, [{ key: r.key, rec: fallback }]);
      touched.add(r.collection);
    }
    if (res.rejected.length) showError(new Error(`Not saved: ${res.rejected[0]!.error}`));
    await localStore.dequeue(batch);
    cursor = res.serverTime;
    user = res.user;
  }

  await localStore.setMeta('lastSyncedAt', cursor!);
  if (settingsRaw && settingsRaw === (await localStore.getMeta('pendingSettings'))) await localStore.setMeta('pendingSettings', '');
  if (user) useAuth.setState({ user });
  for (const c of touched) void queryClient.invalidateQueries({ queryKey: [c] });
  useSync.setState({ status: 'synced', pending: (await localStore.queued()).length });
}

let running: Promise<void> | null = null;
let again = false;
let retry: ReturnType<typeof setTimeout> | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

/** Push the queue and pull changes. Safe to call often: concurrent calls coalesce into one extra round. */
export function syncNow(): Promise<void> {
  if (useAuth.getState().status !== 'signedIn') return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  if (retry) clearTimeout(retry);
  running = (async () => {
    do {
      again = false;
      try {
        await once();
      } catch (e) {
        const offline = e instanceof ApiError && e.status === 0;
        useSync.setState({ status: offline ? 'offline' : 'error' });
        await refreshPending();
        if (!offline) console.warn('[sync]', e);
        retry = setTimeout(() => void syncNow(), RETRY_MS);
        return;
      }
    } while (again);
  })().finally(() => (running = null));
  return running;
}

/** After a local write: sync shortly (batches quick successive edits). */
export function requestSync(delayMs = 1200) {
  void refreshPending();
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delayMs);
}

/** Wipes local data when a different account signs in on this device. */
export async function bindStoreToUser(userId: string) {
  const owner = await localStore.getMeta('userId');
  if (owner && owner !== userId) await localStore.clear();
  if (owner !== userId) await localStore.setMeta('userId', userId);
}
setOnSignedIn(bindStoreToUser);

/** Queue an item directly (used by the collection helpers). */
export async function queueWrite(collection: string, rec: Rec) {
  const key = keyOf(collection, rec);
  await localStore.putMany(collection, [{ key, rec }]);
  await localStore.enqueue({ collection, key, rec } satisfies QueueItem);
  requestSync();
}

/** Sync on start, on return to the foreground, on reconnect (web), and every 5 minutes. */
export function useSyncTriggers() {
  useEffect(() => {
    void syncNow();
    const app = AppState.addEventListener('change', (s) => s === 'active' && void syncNow());
    const timer = setInterval(() => void syncNow(), INTERVAL_MS);
    const online = () => void syncNow();
    if (Platform.OS === 'web') window.addEventListener('online', online);
    return () => {
      app.remove();
      clearInterval(timer);
      if (Platform.OS === 'web') window.removeEventListener('online', online);
    };
  }, []);
}
