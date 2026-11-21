import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/stores/auth';
import { useSettings } from '@/stores/settings';
import { lockNow } from './session';

/** Locks after the app has been in the background longer than the chosen delay.
 *  react-native-web maps AppState to page visibility, so this also covers browser tabs. */
export function useAutoLock() {
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const { lock } = useSettings.getState();
      if (state === 'background' || (state === 'inactive' && lock.autoLockSec === 0)) {
        hiddenAt.current ??= Date.now();
        return;
      }
      if (state !== 'active' || hiddenAt.current === null) return;
      const awayMs = Date.now() - hiddenAt.current;
      hiddenAt.current = null;
      if (lock.mode === 'none' || lock.autoLockSec === -1) return;
      if (useAuth.getState().status === 'signedIn' && awayMs >= lock.autoLockSec * 1000) lockNow();
    });
    return () => sub.remove();
  }, []);
}
