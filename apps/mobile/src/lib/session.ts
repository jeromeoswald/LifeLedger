import type { AuthResponse, SignInInput, SignUpInput, User } from '@lifeledger/shared';
import { useAuth } from '../stores/auth';
import { useSettings } from '../stores/settings';
import { ApiError, api, applyAuth, rawRequest, refreshSession, setOnSessionLost } from './api';
import { KEYS, storage } from './storage';
import { queryClient } from './queryClient';

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

export async function signOut() {
  try {
    const refreshToken = await storage.get(KEYS.refreshToken);
    await rawRequest('/auth/logout', { method: 'POST', body: refreshToken ? { refreshToken } : {} });
  } catch {
    // offline: sign out locally anyway; the server session expires on its own
  }
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
    if (e instanceof ApiError && e.status === 0) useAuth.setState({ status: 'offline' });
    else throw e;
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

export async function updateMe(patch: Partial<Pick<User, 'baseCurrency' | 'timeZone'>>) {
  const { user } = await api<{ user: User }>('/auth/me', { method: 'PATCH', body: patch });
  useAuth.setState({ user });
  return user;
}
