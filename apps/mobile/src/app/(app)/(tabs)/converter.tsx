import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  convertMinor,
  crossRate,
  formatMoney,
  formatRate,
  getCurrency,
  toMinor,
} from '@lifeledger/shared';
import { useAuth } from '@/stores/auth';
import { useSettings } from '@/stores/settings';
import { Card, P, Screen, SectionTitle, Segmented } from '@/components/ui';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { Columns } from '@/components/Columns';
import { RatesNote } from '@/components/wallet/Money';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useToday } from '@/lib/work';
import { useRates } from '@/lib/wallet';

type Range = '7d' | '30d' | '1y';
const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '1y': 365 };

export default function Converter() {
  const tz = useAuth((s) => s.user?.timeZone ?? 'Asia/Dubai');
  const today = useToday(tz);
  const rates = useRates();
  const favourites = useSettings((s) => s.fxFavourites);
  const setFavourites = useSettings((s) => s.setFxFavourites);
  const [from, setFrom] = useState(favourites[0]?.split('>')[0] ?? 'AED');
  const [to, setTo] = useState(favourites[0]?.split('>')[1] ?? 'INR');
  const [amount, setAmount] = useState('100');
  const [range, setRange] = useState<Range>('30d');

  const minor = safeMinor(amount, from);
  const rate = (a: string, b: string) => {
    try {
      return rates.data ? crossRate(rates.data, a, b) : null;
    } catch {
      return null;
    }
  };
  const fwd = rate(from, to);
  const back = rate(to, from);
  const result = fwd !== null && minor !== null ? convertMinor(minor, from, to, fwd) : null;
  const pair = `${from}>${to}`;
  const isFav = favourites.includes(pair);
  const targets = [...new Set(favourites.flatMap((p) => p.split('>')))].filter((c) => c !== from);

  const start = addDays(today, -RANGE_DAYS[range]);
  const history = useQuery({
    queryKey: ['fxhist', from, to, start, today],
    queryFn: () => api<{ points: { date: string; rate: string }[]; source: string }>(`/fx/history?from=${from}&to=${to}&start=${start}&end=${today}`),
    enabled: from !== to,
    staleTime: 6 * 60 * 60 * 1000,
  });
  const pts = history.data?.points ?? [];
  const values = pts.map((p) => Number(p.rate)); // display only: chart heights, never money maths
  const change = values.length > 1 ? ((values.at(-1)! - values[0]!) / values[0]!) * 100 : null;

  return (
    <Screen>
      <Card>
        <Text className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">Amount</Text>
        <View className="flex-row items-center gap-2">
          <TextInput
            accessibilityLabel={`Amount in ${from}`}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
            keyboardType="decimal-pad"
            className="min-h-14 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-2xl font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <CurrencyPicker variant="pill" label="From currency" value={from} onChange={setFrom} />
        </View>

        <View className="my-3 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap currencies"
            onPress={() => {
              setFrom(to);
              setTo(from);
            }}
            className="h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
          >
            <Text className="text-xl text-slate-700 dark:text-slate-200">⇅</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFav ? `Remove ${from} to ${to} from favourites` : `Add ${from} to ${to} to favourites`}
            onPress={() => void setFavourites(isFav ? favourites.filter((p) => p !== pair) : [...favourites, pair])}
            className="min-h-11 flex-row items-center px-2"
          >
            <Text className={`text-xl ${isFav ? 'text-amber-500' : 'text-slate-400'}`}>{isFav ? '★' : '☆'}</Text>
            <Text className="ml-1 text-sm text-slate-600 dark:text-slate-300">{isFav ? 'Favourite' : 'Add to favourites'}</Text>
          </Pressable>
        </View>

        <View className="flex-row items-center justify-between">
          <Text accessibilityLiveRegion="polite" className="flex-1 text-3xl font-bold text-slate-900 dark:text-white" numberOfLines={1} adjustsFontSizeToFit>
            {result !== null ? formatMoney(result, to) : '—'}
          </Text>
          <CurrencyPicker variant="pill" label="To currency" value={to} onChange={setTo} />
        </View>
        {fwd && back ? (
          <View className="mt-2">
            <P className="text-sm">1 {from} = {formatRate(fwd)} {to}</P>
            <P className="text-sm">1 {to} = {formatRate(back)} {from}</P>
          </View>
        ) : rates.data ? (
          <P className="mt-2 text-sm">No rate available for this pair.</P>
        ) : null}
        <View className="mt-2">
          <RatesNote rates={rates.data} error={rates.isError} />
          {rates.data ? (
            <P className="text-xs">
              Last updated {new Intl.DateTimeFormat('en-AE', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(rates.data.fetchedAt))}
            </P>
          ) : null}
        </View>
      </Card>

      <SectionTitle>History · {from} → {to}</SectionTitle>
      <Card>
        <Segmented
          label="History range"
          value={range}
          onChange={setRange}
          options={[
            { value: '7d', label: '7 days' },
            { value: '30d', label: '30 days' },
            { value: '1y', label: '1 year' },
          ]}
        />
        {from === to ? <P>Pick two different currencies.</P> : null}
        {history.isLoading ? <P>Loading history…</P> : null}
        {history.isError ? <P>History unavailable right now.</P> : null}
        {pts.length > 1 ? (
          <>
            <Columns
              values={values}
              a11y={`${from} to ${to} over ${range}: from ${formatRate(pts[0]!.rate)} to ${formatRate(pts.at(-1)!.rate)}`}
            />
            <View className="mt-2 flex-row justify-between">
              <Text className="text-xs text-slate-500">{formatDate(pts[0]!.date, { day: 'numeric', month: 'short', year: range === '1y' ? 'numeric' : undefined })}</Text>
              <Text className={`text-xs font-semibold ${change !== null && change < 0 ? 'text-red-600' : 'text-teal-600 dark:text-teal-400'}`}>
                {change !== null ? `${change < 0 ? '' : '+'}${change.toFixed(2)}%` : ''}
              </Text>
              <Text className="text-xs text-slate-500">{formatDate(pts.at(-1)!.date, { day: 'numeric', month: 'short' })}</Text>
            </View>
            <P className="mt-1 text-xs">
              Low {formatRate(String(Math.min(...values)))} · High {formatRate(String(Math.max(...values)))} · {history.data?.source === 'frankfurter' ? 'ECB data via Frankfurter' : history.data?.source === 'usd-peg' ? 'Fixed USD peg' : 'From saved daily rates'}
            </P>
          </>
        ) : !history.isLoading && from !== to && history.data ? (
          <P>Not enough history for this pair yet.</P>
        ) : null}
      </Card>

      <SectionTitle>{minor !== null ? formatMoney(minor, from) : `— ${from}`} in your favourites</SectionTitle>
      <Card>
        {targets.map((c) => {
          const r = rate(from, c);
          const v = r !== null && minor !== null ? convertMinor(minor, from, c, r) : null;
          return (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={`Convert to ${getCurrency(c).name}`}
              onPress={() => setTo(c)}
              className="min-h-12 flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800"
            >
              <Text className="text-slate-600 dark:text-slate-300">{c} · {getCurrency(c).name}</Text>
              <Text className="text-base font-semibold text-slate-900 dark:text-white">{v !== null ? formatMoney(v, c) : '—'}</Text>
            </Pressable>
          );
        })}
        {!targets.length ? <P>Star a pair to add it here.</P> : null}
      </Card>

      <SectionTitle>Favourite pairs</SectionTitle>
      <View className="mb-6 flex-row flex-wrap gap-2">
        {favourites.map((p) => {
          const [a, b] = p.split('>') as [string, string];
          return (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityLabel={`Open ${a} to ${b}`}
              onPress={() => {
                setFrom(a);
                setTo(b);
              }}
              className={`min-h-11 justify-center rounded-full border px-4 ${p === pair ? 'border-brand bg-brand' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
            >
              <Text className={p === pair ? 'font-semibold text-white' : 'text-slate-800 dark:text-slate-100'}>
                {a} → {b}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function safeMinor(v: string, currency: string): number | null {
  try {
    return toMinor(v.replace(/\.$/, '') || '0', currency);
  } catch {
    return null;
  }
}
