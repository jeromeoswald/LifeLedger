import { create } from 'zustand';
import type { User } from '@lifeledger/shared';

export type AuthStatus = 'loading' | 'signedOut' | 'locked' | 'signedIn' | 'offline';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: User | null;
}

export const useAuth = create<AuthState>(() => ({ status: 'loading', accessToken: null, user: null }));
