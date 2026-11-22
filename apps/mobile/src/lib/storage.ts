import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Native: Keychain / Keystore. Web: localStorage (only non-secret values and the PIN hash;
// the web refresh token never touches JS — it lives in an httpOnly cookie).
const web = Platform.OS === 'web';

export const storage = {
  async get(key: string): Promise<string | null> {
    if (web) return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (web) globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (web) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};

export const KEYS = {
  refreshToken: 'll.refreshToken', // native only
  hasSession: 'll.hasSession',
  lockConfig: 'll.lockConfig',
  pinHash: 'll.pinHash',
  pinSalt: 'll.pinSalt',
  pinFails: 'll.pinFails',
  displayCurrency: 'll.displayCurrency',
  fxFavourites: 'll.fxFavourites',
  /** last known profile, so the app can open offline */
  user: 'll.user',
} as const;
