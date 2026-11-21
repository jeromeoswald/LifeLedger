import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { KEYS, storage } from './storage';
import { clearLocalSession } from './session';

export const MAX_PIN_FAILS = 5;
export const MAX_BIOMETRIC_FAILS = 3;
export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin);

// SHA-256(salt:PIN) in secure storage. A 4-6 digit PIN is guessable from its hash, so the real
// protection is the OS keystore plus the 5-attempt sign-out below.
const hashPin = (pin: string, salt: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export async function savePin(pin: string) {
  if (!isValidPin(pin)) throw new Error('PIN must be 4-6 digits');
  const salt = toHex(Crypto.getRandomBytes(16));
  await storage.set(KEYS.pinSalt, salt);
  await storage.set(KEYS.pinHash, await hashPin(pin, salt));
  await storage.remove(KEYS.pinFails);
}

export async function clearPin() {
  await Promise.all([storage.remove(KEYS.pinHash), storage.remove(KEYS.pinSalt), storage.remove(KEYS.pinFails)]);
}

export type PinResult = { ok: true } | { ok: false; remaining: number } | { ok: false; signedOut: true };

export async function checkPin(pin: string): Promise<PinResult> {
  const [hash, salt] = await Promise.all([storage.get(KEYS.pinHash), storage.get(KEYS.pinSalt)]);
  if (hash && salt && (await hashPin(pin, salt)) === hash) {
    await storage.remove(KEYS.pinFails);
    return { ok: true };
  }
  const fails = Number((await storage.get(KEYS.pinFails)) ?? 0) + 1;
  if (fails >= MAX_PIN_FAILS) {
    await clearLocalSession(); // forget tokens: full password sign-in required
    return { ok: false, signedOut: true };
  }
  await storage.set(KEYS.pinFails, String(fails));
  return { ok: false, remaining: MAX_PIN_FAILS - fails };
}

/** Biometric is offered only when the device has the hardware AND something is enrolled. */
export async function biometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

/** OS prompt. Biometric data never leaves the device; the app only gets success or failure. */
export async function promptBiometric(): Promise<'success' | 'failed' | 'cancelled'> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock LifeLedger',
    cancelLabel: 'Use PIN',
    disableDeviceFallback: true,
  });
  if (r.success) return 'success';
  return r.error === 'user_cancel' || r.error === 'system_cancel' || r.error === 'app_cancel'
    ? 'cancelled'
    : 'failed';
}
