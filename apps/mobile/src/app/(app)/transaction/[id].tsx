import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  effectiveRate,
  formatRate,
  fromMinor,
  nextDueDate,
  parseDate,
  toMinor,
  transactionSchema,
  type Account,
  type Recurring,
  type Transaction,
  type TxType,
} from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { Button, ErrorText, Field, P, Screen, SectionTitle, Segmented, fieldErrors } from '@/components/ui';
import { Chip, DateField } from '@/components/DateField';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { AmountPad } from '@/components/wallet/AmountPad';
import { Money, RatesNote } from '@/components/wallet/Money';
import { ACCOUNT_ICONS, buildTransaction, saveTransaction, useAccounts, useCategories, useRates, useTransactions } from '@/lib/wallet';
import { approxMinor } from '@lifeledger/shared';
import { newBase, removeRecord, saveRecord } from '@/lib/records';
import { useToday } from '@/lib/work';

type Repeat = 'none' | 'weekly' | 'monthly';

export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: txs, isLoading } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const existing = txs?.find((t) => t.clientId === id);
  const live = accounts.filter((a) => !a.archivedAt);

  if (id !== 'new' && !existing) return <Screen><P>{isLoading ? 'Loading…' : 'This transaction no longer exists.'}</P></Screen>;
  if (!live.length) {
    return (
      <Screen>
        <P className="mb-4">Add an account first (cash, bank, card or savings).</P>
        <Button title="Add account" onPress={() => router.replace({ pathname: '/account/[id]', params: { id: 'new' } })} />
      </Screen>
    );
  }
  return <Editor key={id} existing={existing} accounts={accounts} />;
}

function Editor({ existing, accounts }: { existing?: Transaction; accounts: Account[] }) {
  const user = useAuth((s) => s.user)!;
  const base = user.baseCurrency;
  const today = useToday(user.timeZone);
  const { data: categories = [] } = useCategories();
  const rates = useRates();
  const active = accounts.filter((a) => !a.archivedAt || a.clientId === existing?.accountId || a.clientId === existing?.toAccountId);

  const [type, setType] = useState<TxType>(existing?.type ?? 'expense');
  const [accountId, setAccountId] = useState(existing?.accountId ?? active[0]!.clientId);
  const account = active.find((a) => a.clientId === accountId) ?? active[0]!;
  const [currency, setCurrency] = useState(existing?.currency ?? account.currency);
  const [amount, setAmount] = useState(existing ? trimZeros(fromMinor(existing.amountMinor, existing.currency)) : '');
  const [toAccountId, setToAccountId] = useState<string | null>(existing?.toAccountId ?? active.find((a) => a.clientId !== accountId)?.clientId ?? null);
  const toAccount = active.find((a) => a.clientId === toAccountId) ?? null;
  const [toAmountEdit, setToAmountEdit] = useState<string | null>(existing?.toAmountMinor && existing.toCurrency ? fromMinor(existing.toAmountMinor, existing.toCurrency) : null);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [date, setDate] = useState(existing?.date ?? today);
  const [note, setNote] = useState(existing?.note ?? '');
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const payCurrency = type === 'transfer' ? account.currency : currency;
  const amountMinor = safeMinor(amount, payCurrency);
  const preview = amountMinor && payCurrency !== base ? approxMinor(amountMinor, payCurrency, base, rates.data) : null;
  const sameCcyTransfer = toAccount && toAccount.currency === account.currency;
  const autoToMinor = toAccount && amountMinor ? approxMinor(amountMinor, account.currency, toAccount.currency, rates.data) : null;
  const toMinor_ = !toAccount ? null : sameCcyTransfer ? amountMinor : toAmountEdit !== null ? safeMinor(toAmountEdit, toAccount.currency) : autoToMinor;
  const cats = categories.filter((c) => !c.deletedAt && !c.archivedAt && c.kind === (type === 'income' ? 'income' : 'expense'));

  const pickAccount = (a: Account) => {
    if (currency === account.currency) setCurrency(a.currency); // follow the account unless a foreign currency was chosen
    setAccountId(a.clientId);
    if (toAccountId === a.clientId) setToAccountId(active.find((x) => x.clientId !== a.clientId)?.clientId ?? null);
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!amountMinor) errs.amountMinor = 'Enter an amount';
    if (type === 'transfer' && !toAccount) errs.toAccountId = 'Pick the account to transfer to';
    if (type === 'transfer' && !toMinor_) errs.toAmountMinor = 'Enter the amount received';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    let tx: Transaction;
    try {
      tx = buildTransaction(
        { type, date, account, amountMinor: amountMinor!, currency: payCurrency, categoryId, note, toAccount, toAmountMinor: toMinor_ },
        rates.data,
        base,
        existing,
      );
    } catch (e) {
      setErrors({ form: (e as Error).message });
      return;
    }
    let rule: Recurring | null = null;
    if (repeat !== 'none' && !existing) {
      rule = {
        ...newBase(),
        template: { type, accountId: account.clientId, amountMinor: amountMinor!, currency: payCurrency, categoryId: tx.categoryId, note: tx.note, toAccountId: tx.toAccountId, toAmountMinor: tx.toAmountMinor },
        recurrence: { freq: repeat, interval: 1, weekdays: [], monthDay: repeat === 'monthly' ? parseDate(date).d : null },
        nextDate: '',
        pausedAt: null,
      };
      rule.nextDate = nextDueDate(date, rule.recurrence);
      tx.recurringId = rule.clientId;
    }
    const parsed = transactionSchema.safeParse(tx);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    const ok = (await saveTransaction(parsed.data, rates.data)) && (!rule || (await saveRecord('recurring', rule)));
    setBusy(false);
    if (ok) router.back();
  };

  return (
    <Screen>
      <Segmented
        label="Transaction type"
        value={type}
        onChange={(t) => {
          setType(t);
          setCategoryId(null);
        }}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
          { value: 'transfer', label: 'Transfer' },
        ]}
      />

      {/* Amount display */}
      <View className="mb-2 flex-row items-center justify-between">
        <Text
          accessibilityLabel={`Amount ${amount || '0'} ${payCurrency}`}
          className={`flex-1 text-5xl font-bold ${type === 'income' ? 'text-teal-600 dark:text-teal-400' : 'text-slate-900 dark:text-white'}`}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {amount || '0'}
        </Text>
        {type === 'transfer' ? (
          <Text className="text-lg font-semibold text-slate-600 dark:text-slate-300">{account.currency}</Text>
        ) : (
          <CurrencyPicker variant="pill" label="Currency" value={currency} onChange={setCurrency} />
        )}
      </View>
      <View className="mb-3 min-h-6">
        {preview !== null ? <Money minor={preview} currency={base} approx className="text-base font-semibold text-slate-600 dark:text-slate-300" /> : null}
        {payCurrency !== base && preview === null && amountMinor ? <P className="text-sm">Rate unavailable for {payCurrency}</P> : null}
      </View>
      <ErrorText>{errors.amountMinor}</ErrorText>
      <AmountPad value={amount} currency={payCurrency} onChange={setAmount} />

      <SectionTitle>{type === 'transfer' ? 'From account' : 'Account'}</SectionTitle>
      <View className="flex-row flex-wrap gap-2">
        {active.filter((a) => !a.archivedAt).map((a) => (
          <Chip key={a.clientId} text={`${ACCOUNT_ICONS[a.type]} ${a.name} · ${a.currency}`} selected={a.clientId === account.clientId} onPress={() => pickAccount(a)} />
        ))}
      </View>
      {type !== 'transfer' && currency !== account.currency && amountMinor ? (
        <P className="mt-2 text-sm">
          Paid in {currency}; {account.name}'s balance moves by the {account.currency} equivalent at today's rate.
        </P>
      ) : null}

      {type === 'transfer' ? (
        <>
          <SectionTitle>To account</SectionTitle>
          <View className="flex-row flex-wrap gap-2">
            {active.filter((a) => !a.archivedAt && a.clientId !== account.clientId).map((a) => (
              <Chip key={a.clientId} text={`${ACCOUNT_ICONS[a.type]} ${a.name} · ${a.currency}`} selected={a.clientId === toAccountId} onPress={() => { setToAccountId(a.clientId); setToAmountEdit(null); }} />
            ))}
          </View>
          <ErrorText>{errors.toAccountId}</ErrorText>
          {toAccount && !sameCcyTransfer ? (
            <View className="mt-3">
              <Field
                label={`Amount received in ${toAccount.currency} (edit to match your bank)`}
                value={toAmountEdit ?? (autoToMinor !== null ? fromMinor(autoToMinor, toAccount.currency) : '')}
                onChangeText={(t) => setToAmountEdit(t.replace(/[^\d.]/g, ''))}
                keyboardType="decimal-pad"
                error={errors.toAmountMinor}
              />
              {amountMinor && toMinor_ ? (
                <P className="-mt-2 mb-2 text-sm">
                  Effective rate: 1 {account.currency} = {formatRate(effectiveRate(amountMinor, account.currency, toMinor_, toAccount.currency))} {toAccount.currency}
                  {toAmountEdit === null ? ' (today\'s rate)' : ''}
                </P>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <>
          <SectionTitle>Category</SectionTitle>
          <View className="flex-row flex-wrap gap-2">
            {cats.map((c) => (
              <Chip key={c.clientId} text={`${c.icon} ${c.name}`.trim()} selected={c.clientId === categoryId} onPress={() => setCategoryId(c.clientId === categoryId ? null : c.clientId)} />
            ))}
            <Chip text="+ Manage" selected={false} onPress={() => router.push('/categories')} />
          </View>
        </>
      )}

      <View className="mt-4">
        <DateField label="Date" value={date} onChange={(d) => setDate(d ?? today)} today={today} allowNone={false} />
      </View>
      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Carrefour" />
      {!existing ? (
        <>
          <SectionTitle>Repeat</SectionTitle>
          <Segmented
            label="Repeat"
            value={repeat}
            onChange={setRepeat}
            options={[
              { value: 'none', label: 'Once' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        </>
      ) : existing.recurringId ? (
        <P className="mb-3 text-sm">Part of a repeating entry (manage it on the Wallet tab).</P>
      ) : null}

      {existing && existing.currency !== existing.baseCurrency ? (
        <P className="mb-3 text-sm">
          Saved at 1 {existing.currency} = {formatRate(existing.fxRateToBase)} {existing.baseCurrency} ({existing.rateSource}, {existing.rateDate}). This stays fixed unless you change the amount or currency.
        </P>
      ) : null}
      <ErrorText>{errors.form ?? errors.amountBaseMinor ?? errors.effectiveRate}</ErrorText>
      <Button title={existing ? 'Save changes' : 'Save'} onPress={() => void save()} loading={busy} />
      {existing ? (
        <Button title="Delete" variant="ghost" className="mt-2" onPress={async () => { if (await removeRecord('transactions', existing.clientId)) router.back(); }} />
      ) : null}
      <View className="mt-4">
        <RatesNote rates={rates.data} error={rates.isError} />
      </View>
    </Screen>
  );
}

/** "125.50" → "125.5", "100.00" → "100", "1500" (JPY) stays "1500". */
const trimZeros = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);

function safeMinor(v: string, currency: string): number | null {
  try {
    const m = toMinor(v.replace(/\.$/, ''), currency);
    return m > 0 ? m : null;
  } catch {
    return null;
  }
}
