import type { AuthResponse, SignInInput, SignUpInput, User } from '@lifeledger/shared';
import { useAuth } from '../stores/auth';
import { useSettings } from '../stores/settings';
import { ApiError, api, applyAuth, rawRequest, refreshSession, setOnSessionLost } from './api';
import { KEYS, storage } from './storage';
import { queryClient } from './queryClient';
import { localStore } from './store/localStore';
import { requestSync, syncNow } from './sync';

export async function signIn(input: SignInInput) {
  await applyAuth(await rawRequest<AuthResponse>('/auth/login', { method: 'POST', body: input }));
  await storage.remove(KEYS.pinFails);
}

export async function signUp(input: SignUpInput) {
  await applyAuth(await rawRequest<AuthResponse>('/auth/register', { method: 'POST', body: input }));
}

export async function clearLocalSession() {
  await Promise.all([
    storage.remove(KEYS.refreshToken),
    storage.remove(KEYS.hasSession),
    storage.remove(KEYS.pinFails),
  ]);
  queryClient.clear(); // never show one account's data to the next
  useAuth.setState({ status: 'signedOut', accessToken: null, user: null });
}
setOnSessionLost(clearLocalSession);

// Keep the last known profile on the device so the app can open offline.
useAuth.subscribe((s, prev) => {
  if (s.user && s.user !== prev.user) void storage.set(KEYS.user, JSON.stringify(s.user));
});

export async function signOut() {
  await syncNow().catch(() => {}); // push anything pending first
  try {
    const refreshToken = await storage.get(KEYS.refreshToken);
    await rawRequest('/auth/logout', { method: 'POST', body: refreshToken ? { refreshToken } : {} });
  } catch {
    // offline: sign out locally anyway; the server session expires on its own
  }
  // Wipe this device's copy, unless changes are still unsent (kept until this account signs in again).
  if (!(await localStore.queued()).length) await localStore.clear();
  await storage.remove(KEYS.user);
  await clearLocalSession();
}

export async function signOutAllDevices() {
  await api('/auth/logout-all', { method: 'POST' });
  await clearLocalSession();
}

/** Uses the stored refresh token (only reached after unlock when a lock is set). */
export async function resumeSession() {
  try {
    if (!(await refreshSession())) await clearLocalSession();
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 0)) throw e;
    // Offline: open from this device's data with the last known profile; the token refreshes once online.
    const cached = await storage.get(KEYS.user);
    if (cached) useAuth.setState({ status: 'signedIn', user: JSON.parse(cached) as User, accessToken: null });
    else useAuth.setState({ status: 'offline' });
  }
}

/** App start: signed-out, locked, or resume the session. */
export async function boot() {
  const lock = await useSettings.getState().loadLock();
  if (!(await storage.get(KEYS.hasSession))) {
    useAuth.setState({ status: 'signedOut' });
    return;
  }
  if (lock.mode !== 'none') {
    useAuth.setState({ status: 'locked' });
    return;
  }
  await resumeSession();
}

export function lockNow() {
  useAuth.setState({ status: 'locked', accessToken: null });
}

export async function updateMe(
  patch: Partial<Pick<User, 'baseCurrency' | 'timeZone' | 'attendanceDefaultMinutes' | 'weekStart' | 'showAttendanceCard'>>,
) {
  try {
    const { user } = await api<{ user: User }>('/auth/me', { method: 'PATCH', body: patch });
    useAuth.setState({ user });
    return user;
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 0)) throw e;
    // Offline: apply now, and let sync send it (it wins only if still the newest settings edit).
    const prev = JSON.parse((await localStore.getMeta('pendingSettings')) || '{"patch":{}}') as { patch: object };
    await localStore.setMeta('pendingSettings', JSON.stringify({ updatedAt: new Date().toISOString(), patch: { ...prev.patch, ...patch } }));
    const user = { ...useAuth.getState().user!, ...patch };
    useAuth.setState({ user });
    requestSync();
    return user;
  }
}
