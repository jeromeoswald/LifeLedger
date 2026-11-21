import { create } from 'zustand';
import { KEYS, storage } from '../lib/storage';

export type LockMode = 'none' | 'pin' | 'biometric';
/** Seconds in background before locking; -1 = never. */
export type AutoLock = 0 | 60 | 300 | 900 | -1;

export interface LockConfig {
  mode: LockMode;
  autoLockSec: AutoLock;
  pinLength: number;
}

export const DEFAULT_LOCK: LockConfig = { mode: 'none', autoLockSec: 60, pinLength: 0 };

interface SettingsState {
  lock: LockConfig;
  setLock: (patch: Partial<LockConfig>) => Promise<void>;
  loadLock: () => Promise<LockConfig>;
  /** currency every balance/total/chart is shown in; null = the user's base currency */
  displayCurrency: string | null;
  setDisplayCurrency: (code: string | null) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  lock: DEFAULT_LOCK,
  displayCurrency: null,
  async setDisplayCurrency(code) {
    set({ displayCurrency: code });
    if (code) await storage.set(KEYS.displayCurrency, code);
    else await storage.remove(KEYS.displayCurrency);
  },
  async setLock(patch) {
    const lock = { ...get().lock, ...patch };
    set({ lock });
    await storage.set(KEYS.lockConfig, JSON.stringify(lock));
  },
  async loadLock() {
    let lock = DEFAULT_LOCK;
    try {
      const raw = await storage.get(KEYS.lockConfig);
      if (raw) lock = { ...DEFAULT_LOCK, ...(JSON.parse(raw) as Partial<LockConfig>) };
    } catch {
      // corrupt value: fall back to defaults
    }
    set({ lock, displayCurrency: await storage.get(KEYS.displayCurrency).catch(() => null) });
    return lock;
  },
}));

/** The display currency, falling back to the base currency. */
export function useDisplayCurrency(base: string | undefined) {
  return useSettings((s) => s.displayCurrency) ?? base ?? 'AED';
}
