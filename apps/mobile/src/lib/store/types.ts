/** A stored record: everything synced has updatedAt + deletedAt (tombstones are kept until synced). */
export type Rec = { clientId: string; updatedAt: string; deletedAt: string | null } & Record<string, unknown>;

export interface QueueItem {
  collection: string;
  key: string;
  rec: Rec;
}

/**
 * The one repository interface the app reads and writes through: expo-sqlite on Android/iOS
 * (localStore.ts), IndexedDB on the web (localStore.web.ts).
 */
export interface LocalStore {
  all(collection: string): Promise<Rec[]>;
  get(collection: string, key: string): Promise<Rec | null>;
  putMany(collection: string, items: { key: string; rec: Rec }[]): Promise<void>;
  /** queue keeps only the latest pending change per record */
  enqueue(item: QueueItem): Promise<void>;
  queued(): Promise<QueueItem[]>;
  /** removes items that were sent, unless they were edited again meanwhile (newer updatedAt) */
  dequeue(sent: QueueItem[]): Promise<void>;
  getMeta(k: string): Promise<string | null>;
  setMeta(k: string, v: string): Promise<void>;
  /** wipe everything (switching to another account) */
  clear(): Promise<void>;
}

/** Attendance is one entry per day, so it is stored and synced by date; everything else by clientId. */
export const keyOf = (collection: string, rec: Rec) => (collection === 'attendance' ? String(rec.date) : rec.clientId);
