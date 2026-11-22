import * as SQLite from 'expo-sqlite';
import type { LocalStore, QueueItem, Rec } from './types';

// Android/iOS: expo-sqlite. Records are JSON blobs keyed by (collection, key).
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function db() {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync('lifeledger.db');
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS records (c TEXT NOT NULL, k TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (c, k));
      CREATE TABLE IF NOT EXISTS queue (c TEXT NOT NULL, k TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (c, k));
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);
    `);
    return d;
  })();
  return dbPromise;
}

export const localStore: LocalStore = {
  async all(c) {
    const rows = await (await db()).getAllAsync<{ json: string }>('SELECT json FROM records WHERE c = ?', [c]);
    return rows.map((r) => JSON.parse(r.json) as Rec);
  },
  async get(c, k) {
    const row = await (await db()).getFirstAsync<{ json: string }>('SELECT json FROM records WHERE c = ? AND k = ?', [c, k]);
    return row ? (JSON.parse(row.json) as Rec) : null;
  },
  async putMany(c, items) {
    const d = await db();
    await d.withTransactionAsync(async () => {
      for (const { key, rec } of items) await d.runAsync('INSERT OR REPLACE INTO records (c, k, json) VALUES (?, ?, ?)', [c, key, JSON.stringify(rec)]);
    });
  },
  async enqueue({ collection, key, rec }) {
    await (await db()).runAsync('INSERT OR REPLACE INTO queue (c, k, json) VALUES (?, ?, ?)', [collection, key, JSON.stringify(rec)]);
  },
  async queued() {
    const rows = await (await db()).getAllAsync<{ c: string; k: string; json: string }>('SELECT c, k, json FROM queue');
    return rows.map((r): QueueItem => ({ collection: r.c, key: r.k, rec: JSON.parse(r.json) as Rec }));
  },
  async dequeue(sent) {
    const d = await db();
    await d.withTransactionAsync(async () => {
      for (const s of sent) {
        await d.runAsync("DELETE FROM queue WHERE c = ? AND k = ? AND json_extract(json, '$.updatedAt') = ?", [s.collection, s.key, s.rec.updatedAt]);
      }
    });
  },
  async getMeta(k) {
    return (await (await db()).getFirstAsync<{ v: string }>('SELECT v FROM meta WHERE k = ?', [k]))?.v ?? null;
  },
  async setMeta(k, v) {
    await (await db()).runAsync('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', [k, v]);
  },
  async clear() {
    await (await db()).execAsync('DELETE FROM records; DELETE FROM queue; DELETE FROM meta;');
  },
};
