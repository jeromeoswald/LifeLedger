import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { accountSchema, fromMinor, toMinor, type Account, type AccountType } from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { Button, ErrorText, Field, P, Screen, SectionTitle, Segmented, fieldErrors } from '@/components/ui';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { newBase, nowIso, removeRecord, saveRecord } from '@/lib/records';
import { ACCOUNT_ICONS, useAccounts, useTransactions } from '@/lib/wallet';

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: accounts, isLoading } = useAccounts();
  const existing = accounts?.find((a) => a.clientId === id);
  if (id !== 'new' && !existing) return <Screen><P>{isLoading ? 'Loading…' : 'This account no longer exists.'}</P></Screen>;
  return <AccountForm key={id} existing={existing} />;
}

function AccountForm({ existing }: { existing?: Account }) {
  const base = useAuth((s) => s.user?.baseCurrency ?? 'AED');
  const { data: txs = [] } = useTransactions();
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AccountType>(existing?.type ?? 'bank');
  const [currency, setCurrency] = useState(existing?.currency ?? base);
  const [opening, setOpening] = useState(existing ? fromMinor(existing.openingBalanceMinor, existing.currency) : '0');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const used = !!existing && txs.some((t) => t.accountId === existing.clientId || t.toAccountId === existing.clientId);

  const save = async () => {
    let openingBalanceMinor: number;
    try {
      openingBalanceMinor = toMinor(opening.trim() || '0', currency);
    } catch {
      setErrors({ openingBalanceMinor: 'Enter a number like 1500 or -250.75' });
      return;
    }
    const parsed = accountSchema.safeParse({ ...(existing ?? newBase()), name, type, currency, openingBalanceMinor });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error.issues));
    if (!parsed.success) return;
    setBusy(true);
    const ok = await saveRecord('accounts', parsed.data);
    setBusy(false);
    if (ok) router.back();
  };

  return (
    <Screen>
      <Field label="Name" value={name} onChangeText={setName} error={errors.name} placeholder="e.g. Emirates NBD" autoFocus={!existing} />
      <SectionTitle>Type</SectionTitle>
      <Segmented
        label="Account type"
        value={type}
        onChange={setType}
        options={(['cash', 'bank', 'card', 'savings'] as const).map((t) => ({ value: t, label: `${ACCOUNT_ICONS[t]} ${t[0]!.toUpperCase()}${t.slice(1)}` }))}
      />
      {used ? (
        <P className="mb-4 text-sm">Currency: {currency} (fixed — this account already has transactions)</P>
      ) : (
        <CurrencyPicker label="Account currency" value={currency} onChange={setCurrency} />
      )}
      <Field
        label={`Opening balance (${currency})`}
        value={opening}
        onChangeText={(t) => setOpening(t.replace(/[^\d.-]/g, ''))}
        keyboardType="numbers-and-punctuation"
        error={errors.openingBalanceMinor}
      />
      <ErrorText>{errors.form}</ErrorText>
      <Button title={existing ? 'Save changes' : 'Add account'} onPress={() => void save()} loading={busy} />
      {existing ? (
        <>
          <Button
            title={existing.archivedAt ? 'Unarchive' : 'Archive (hide from totals)'}
            variant="secondary"
            className="mt-3"
            onPress={async () => {
              if (await saveRecord('accounts', { ...existing, archivedAt: existing.archivedAt ? null : nowIso() })) router.back();
            }}
          />
          {!used ? (
            <Button title="Delete account" variant="ghost" className="mt-2" onPress={async () => { if (await removeRecord('accounts', existing.clientId)) router.back(); }} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
