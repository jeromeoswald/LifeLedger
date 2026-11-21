import { Platform } from 'react-native';
import type { AuthResponse } from '@lifeledger/shared';
import { useAuth } from '../stores/auth';
import { KEYS, storage } from './storage';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const isWeb = Platform.OS === 'web';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
  }
}

interface Opts {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
}

/** One HTTP call, no auth retry. Network failures surface as ApiError(0). */
export async function rawRequest<T>(path: string, { method = 'GET', body, token }: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client': isWeb ? 'web' : 'native',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: isWeb ? 'include' : 'omit',
    });
  } catch {
    throw new ApiError(0, `Can't reach the server at ${API_URL}`);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; issues?: ApiError['issues'] };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.issues);
  return data as T;
}

/** Saves a fresh session from login/register/refresh. */
export async function applyAuth(data: AuthResponse) {
  if (!isWeb && data.refreshToken) await storage.set(KEYS.refreshToken, data.refreshToken);
  await storage.set(KEYS.hasSession, '1');
  useAuth.setState({ accessToken: data.accessToken, user: data.user, status: 'signedIn' });
}

let refreshing: Promise<boolean> | null = null;

/** Rotates the refresh token. true = signed in; false = session gone. Throws ApiError(0) when offline. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const refreshToken = isWeb ? undefined : await storage.get(KEYS.refreshToken);
      if (!isWeb && !refreshToken) return false;
      const data = await rawRequest<AuthResponse>('/auth/refresh', {
        method: 'POST',
        body: isWeb ? {} : { refreshToken },
      });
      await applyAuth(data);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return false;
      throw e;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

let onSessionLost: () => Promise<void> = async () => {};
/** session.ts registers its clear function here (avoids a circular import). */
export const setOnSessionLost = (fn: () => Promise<void>) => {
  onSessionLost = fn;
};

/** Authenticated call; on 401 refreshes once and retries. */
export async function api<T>(path: string, opts: Omit<Opts, 'token'> = {}): Promise<T> {
  const token = useAuth.getState().accessToken;
  try {
    return await rawRequest<T>(path, { ...opts, token });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    if (!(await refreshSession())) {
      await onSessionLost();
      throw e;
    }
    return rawRequest<T>(path, { ...opts, token: useAuth.getState().accessToken });
  }
}
