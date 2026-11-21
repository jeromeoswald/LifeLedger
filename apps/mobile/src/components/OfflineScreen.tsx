import { useState } from 'react';
import { API_URL } from '@/lib/api';
import { resumeSession, signOut } from '@/lib/session';
import { Button, H1, P, Screen } from './ui';

/** Shown when a saved session exists but the API can't be reached. Offline mode arrives in Phase 6. */
export function OfflineScreen() {
  const [busy, setBusy] = useState(false);
  return (
    <Screen narrow>
      <H1>Can&apos;t reach LifeLedger</H1>
      <P className="mb-6">
        The server at {API_URL} isn&apos;t answering. Check your connection (and that the API is running), then retry.
      </P>
      <Button
        title="Retry"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await resumeSession();
          setBusy(false);
        }}
      />
      <Button title="Sign out" variant="ghost" className="mt-2" onPress={() => void signOut()} />
    </Screen>
  );
}
