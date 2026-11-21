import { useEffect, useState } from 'react';
import { Modal, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { useSettings, type AutoLock, type LockMode } from '@/stores/settings';
import { Button, ErrorText, P, Screen, SectionTitle, Segmented } from '@/components/ui';
import { PinPad } from '@/components/PinPad';
import { biometricAvailable, clearPin, savePin } from '@/lib/lock';
import { signOut, signOutAllDevices } from '@/lib/session';

const AUTO_LOCK: { value: AutoLock; label: string }[] = [
  { value: 0, label: 'Immediately' },
  { value: 60, label: '1 min' },
  { value: 300, label: '5 min' },
  { value: 900, label: '15 min' },
  { value: -1, label: 'Never' },
];

export default function Security() {
  const lock = useSettings((s) => s.lock);
  const setLock = useSettings((s) => s.setLock);
  const [bioOk, setBioOk] = useState(false);
  // When set, the PIN modal is open; after a PIN is saved we switch to this mode.
  const [pinFor, setPinFor] = useState<LockMode | null>(null);
  const logoutAll = useMutation({ mutationFn: signOutAllDevices });

  useEffect(() => {
    void biometricAvailable().then(setBioOk);
  }, []);

  const modes: { value: LockMode; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'pin', label: 'App PIN' },
    ...(bioOk ? [{ value: 'biometric' as const, label: 'Biometric + PIN' }] : []),
  ];

  const chooseMode = async (mode: LockMode) => {
    if (mode === 'none') {
      await clearPin();
      await setLock({ mode: 'none', pinLength: 0 });
    } else if (lock.mode === 'none') {
      setPinFor(mode); // need a PIN first (it is also the biometric backup)
    } else {
      await setLock({ mode });
    }
  };

  return (
    <Screen>
      <SectionTitle>App lock</SectionTitle>
      <P className="mb-3">
        Optional. Locks LifeLedger on this {Platform.OS === 'web' ? 'browser' : 'device'} only.
        {Platform.OS === 'web'
          ? ' On the web the PIN is a convenience lock for this browser.'
          : bioOk
            ? ' Biometric data never leaves your phone.'
            : ' Biometric unlock appears here when your device has fingerprint or Face ID set up.'}
      </P>
      <Segmented label="Lock method" options={modes} value={lock.mode} onChange={(m) => void chooseMode(m)} />

      {lock.mode !== 'none' ? (
        <>
          <Button title="Change PIN" variant="secondary" onPress={() => setPinFor(lock.mode)} className="mb-4" />
          <SectionTitle>Lock after leaving the app</SectionTitle>
          <Segmented
            label="Auto-lock"
            options={AUTO_LOCK}
            value={lock.autoLockSec}
            onChange={(v) => void setLock({ autoLockSec: v })}
          />
        </>
      ) : null}

      <SectionTitle>Sessions</SectionTitle>
      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} className="mb-3" />
      <Button
        title="Sign out of all devices"
        variant="danger"
        loading={logoutAll.isPending}
        onPress={() => logoutAll.mutate()}
      />
      <ErrorText>{logoutAll.error ? logoutAll.error.message : null}</ErrorText>

      <PinSetup
        visible={pinFor !== null}
        onCancel={() => setPinFor(null)}
        onDone={async (pin) => {
          await savePin(pin);
          await setLock({ mode: pinFor ?? 'pin', pinLength: pin.length });
          setPinFor(null);
        }}
      />
    </Screen>
  );
}

function PinSetup({
  visible,
  onCancel,
  onDone,
}: {
  visible: boolean;
  onCancel: () => void;
  onDone: (pin: string) => Promise<void>;
}) {
  const [first, setFirst] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setFirst(null);
      setErr(null);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Text className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
          {first ? 'Confirm your PIN' : 'Choose a 4-6 digit PIN'}
        </Text>
        <Text className="mb-8 text-slate-600 dark:text-slate-300">
          {first ? 'Enter it again' : 'Tap OK when done'}
        </Text>
        <PinPad
          key={first ?? 'first'}
          length={first ? first.length : undefined}
          onSubmit={async (pin) => {
            if (!first) {
              setFirst(pin);
              setErr(null);
            } else if (pin === first) {
              await onDone(pin);
            } else {
              setFirst(null);
              setErr("PINs didn't match. Start again.");
            }
          }}
        />
        <ErrorText>{err}</ErrorText>
        <View className="mt-6 w-72">
          <Button title="Cancel" variant="ghost" onPress={onCancel} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
