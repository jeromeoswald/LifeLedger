import type { LocalStore, QueueItem, Rec } from './types';

// Web: IndexedDB. Same shape as the SQLite store: records/queue keyed by [collection, key], plus meta.
let dbPromise: Promise<IDBDatabase> | null = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('lifeledger', 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('records', { keyPath: ['c', 'k'] }).createIndex('byC', 'c');
      d.createObjectStore('queue', { keyPath: ['c', 'k'] });
      d.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

async function store(name: string, mode: IDBTransactionMode = 'readonly') {
  const tx = (await db()).transaction(name, mode);
  return { s: tx.objectStore(name), tx };
}

type Row = { c: string; k: string; rec: Rec };

export const localStore: LocalStore = {
  async all(c) {
    const { s } = await store('records');
    return ((await done(s.index('byC').getAll(c))) as Row[]).map((r) => r.rec);
  },
  async get(c, k) {
    const { s } = await store('records');
    return ((await done(s.get([c, k]))) as Row | undefined)?.rec ?? null;
  },
  async putMany(c, items) {
    const { s, tx } = await store('records', 'readwrite');
    for (const { key, rec } of items) s.put({ c, k: key, rec } satisfies Row);
    await finished(tx);
  },
  async enqueue({ collection, key, rec }) {
    const { s, tx } = await store('queue', 'readwrite');
    s.put({ c: collection, k: key, rec } satisfies Row);
    await finished(tx);
  },
  async queued() {
    const { s } = await store('queue');
    return ((await done(s.getAll())) as Row[]).map((r): QueueItem => ({ collection: r.c, key: r.k, rec: r.rec }));
  },
  async dequeue(sent) {
    const { s, tx } = await store('queue', 'readwrite');
    for (const item of sent) {
      const req = s.get([item.collection, item.key]);
      req.onsuccess = () => {
        const row = req.result as Row | undefined;
        if (row && row.rec.updatedAt === item.rec.updatedAt) s.delete([item.collection, item.key]); // not edited again meanwhile
      };
    }
    await finished(tx);
  },
  async getMeta(k) {
    const { s } = await store('meta');
    return ((await done(s.get(k))) as { v: string } | undefined)?.v ?? null;
  },
  async setMeta(k, v) {
    const { s, tx } = await store('meta', 'readwrite');
    s.put({ k, v });
    await finished(tx);
  },
  async clear() {
    const tx = (await db()).transaction(['records', 'queue', 'meta'], 'readwrite');
    for (const n of ['records', 'queue', 'meta']) tx.objectStore(n).clear();
    await finished(tx);
  },
};
