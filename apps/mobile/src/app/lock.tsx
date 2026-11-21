import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useSettings } from '@/stores/settings';
import { useAuth } from '@/stores/auth';
import { PinPad } from '@/components/PinPad';
import { Button, ErrorText, Screen } from '@/components/ui';
import { MAX_BIOMETRIC_FAILS, biometricAvailable, checkPin, promptBiometric } from '@/lib/lock';
import { resumeSession, signOut } from '@/lib/session';

export default function Lock() {
  const lock = useSettings((s) => s.lock);
  const [bioOk, setBioOk] = useState(false);
  const [bioFails, setBioFails] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prompted = useRef(false);

  const unlocked = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    await resumeSession(); // releases the stored refresh token and rotates it
    if (useAuth.getState().status === 'locked') setBusy(false);
  }, []);

  const tryBiometric = useCallback(async () => {
    const r = await promptBiometric();
    if (r === 'success') return unlocked();
    if (r === 'failed') {
      setBioFails((n) => {
        const next = n + 1;
        setMsg(next >= MAX_BIOMETRIC_FAILS ? 'Use your PIN instead.' : 'Not recognised. Try again.');
        return next;
      });
    }
  }, [unlocked]);

  useEffect(() => {
    if (lock.mode !== 'biometric') return;
    void biometricAvailable().then((ok) => {
      setBioOk(ok);
      if (ok && !prompted.current) {
        prompted.current = true;
        void tryBiometric();
      }
    });
  }, [lock.mode, tryBiometric]);

  const onPin = async (pin: string) => {
    const r = await checkPin(pin);
    if (r.ok) return unlocked();
    if ('remaining' in r) setMsg(`Wrong PIN. ${r.remaining} ${r.remaining === 1 ? 'try' : 'tries'} left.`);
    // signedOut: the root layout swaps to the sign-in flow
  };

  const canBio = bioOk && bioFails < MAX_BIOMETRIC_FAILS;

  return (
    <Screen narrow>
      <View className="flex-1 items-center justify-center py-8">
        <Text accessibilityRole="header" className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
          LifeLedger is locked
        </Text>
        <Text className="mb-8 text-slate-600 dark:text-slate-300">
          {busy ? 'Unlocking…' : canBio ? 'Use biometrics or enter your PIN' : 'Enter your PIN'}
        </Text>
        <PinPad
          length={lock.pinLength || undefined}
          onSubmit={onPin}
          extraKey={canBio ? { label: 'Face / Touch', onPress: () => void tryBiometric() } : undefined}
        />
        <ErrorText>{msg}</ErrorText>
        <Button title="Sign in with password instead" variant="ghost" className="mt-6" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}
