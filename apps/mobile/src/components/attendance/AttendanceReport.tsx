import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  STATUS_LABEL,
  addDays,
  addMonths,
  attendanceBuckets,
  attendanceByDate,
  attendanceSummary,
  dateRange,
  formatHours,
  parseDate,
  periodRange,
  weekRange,
  weekday,
} from '@lifeledger/shared';
import { Button, Card, P, SectionTitle, Segmented } from '@/components/ui';
import { NavBtn } from '@/components/DateField';
import { Columns } from '@/components/Columns';
import { apiFile } from '@/lib/api';
import { useAttendance } from '@/lib/attendance';
import { CSV_MIME, XLSX_MIME, shareFile } from '@/lib/export';
import { formatDate, formatMonth } from '@/lib/format';
import { showError } from '@/stores/toast';
import { STATUS_STYLE } from './StatusPicker';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Week | Month views, summary, stacked hours chart and month export. Tapping a day selects it above. */
export function AttendanceReport({ selected, onSelect, today, weekStart }: { selected: string; onSelect: (d: string) => void; today: string; weekStart: 0 | 1 }) {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [busy, setBusy] = useState<'csv' | 'xlsx' | null>(null);
  const { start, end } = mode === 'week' ? weekRange(selected, weekStart) : periodRange('month', selected);
  const { data = [], isLoading } = useAttendance(start, end);
  const byDate = attendanceByDate(data);
  const s = attendanceSummary(data, start, end, today);
  const buckets = attendanceBuckets(data, start, end, mode === 'week' ? 'day' : 'week', weekStart);
  const month = selected.slice(0, 7);

  const move = (dir: 1 | -1) => onSelect(mode === 'week' ? addDays(selected, 7 * dir) : addMonths(selected, dir, 1));
  const exportMonth = async (kind: 'csv' | 'xlsx') => {
    setBusy(kind);
    try {
      const data = await apiFile(`/export/attendance.${kind}?month=${month}`);
      await shareFile(`attendance-${month}.${kind}`, data, kind === 'csv' ? CSV_MIME : XLSX_MIME);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View>
      <Segmented
        label="Attendance period"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />
      <View className="mb-2 flex-row items-center justify-between">
        <NavBtn label={`Previous ${mode}`} text="‹" onPress={() => move(-1)} />
        <Text className="text-base font-semibold text-slate-900 dark:text-white">
          {mode === 'week' ? `${formatDate(start)} – ${formatDate(end)}` : formatMonth(start)}
        </Text>
        <NavBtn label={`Next ${mode}`} text="›" onPress={() => move(1)} />
      </View>
      {isLoading ? <P>Loading…</P> : null}

      {mode === 'week' ? (
        <Card>
          {dateRange(start, end).map((d) => {
            const e = byDate.get(d);
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={`${formatDate(d, { weekday: 'long', day: 'numeric', month: 'short' })}: ${e ? STATUS_LABEL[e.status] : 'Not marked'}${e?.status === 'present' ? `, ${formatHours(e.workMinutes)} h work, ${formatHours(e.overtimeMinutes)} h overtime` : ''}`}
                onPress={() => onSelect(d)}
                className={`min-h-12 flex-row items-center border-b border-slate-100 dark:border-slate-800 ${d === selected ? 'bg-teal-50 dark:bg-teal-950' : ''}`}
              >
                <Text className={`w-20 text-sm ${d === today ? 'font-bold text-brand dark:text-brand-light' : 'text-slate-700 dark:text-slate-200'}`}>
                  {DAY_SHORT[weekday(d)]} {parseDate(d).d}
                </Text>
                <View className="flex-1">
                  {e ? (
                    <View className={`self-start rounded-full px-2 py-0.5 ${STATUS_STYLE[e.status].cell}`}>
                      <Text className="text-xs font-semibold text-white">
                        {STATUS_STYLE[e.status].icon} {STATUS_LABEL[e.status]}
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-xs text-slate-400">{d > today ? '' : 'Not marked'}</Text>
                  )}
                </View>
                <Text className="w-14 text-right text-sm text-slate-900 dark:text-white">{e?.status === 'present' ? `${formatHours(e.workMinutes)} h` : '–'}</Text>
                <Text className="w-14 text-right text-sm text-amber-600">{e?.status === 'present' && e.overtimeMinutes ? `+${formatHours(e.overtimeMinutes)}` : ''}</Text>
              </Pressable>
            );
          })}
        </Card>
      ) : (
        <MonthGrid start={start} end={end} weekStart={weekStart} today={today} selected={selected} onSelect={onSelect} byDate={byDate} />
      )}

      <SectionTitle>Summary</SectionTitle>
      <Card>
        <View className="mb-3 flex-row flex-wrap gap-2">
          {(['present', 'off', 'absent', 'sick'] as const).map((k) => (
            <View key={k} className="min-w-20 flex-1 items-center rounded-xl bg-slate-50 py-2 dark:bg-slate-800">
              <Text className={`text-xl font-bold ${STATUS_STYLE[k].text}`}>{s[k]}</Text>
              <Text className="text-xs text-slate-500">{STATUS_LABEL[k]}</Text>
            </View>
          ))}
          <View className="min-w-20 flex-1 items-center rounded-xl bg-slate-50 py-2 dark:bg-slate-800">
            <Text className="text-xl font-bold text-slate-400">{s.notMarked}</Text>
            <Text className="text-xs text-slate-500">Not marked</Text>
          </View>
        </View>
        <Stat label="Working hours" value={`${formatHours(s.workMinutes)} h`} />
        <Stat label="Overtime hours" value={`${formatHours(s.overtimeMinutes)} h`} />
        <Stat label="Man-hours (working + OT)" value={`${formatHours(s.manMinutes)} h`} bold />
        <Stat label="Average per Present day" value={s.present ? `${(s.avgWorkMinutes / 60).toFixed(1)} h` : '–'} />
      </Card>

      <SectionTitle>{mode === 'week' ? 'Hours per day' : 'Hours per week'}</SectionTitle>
      <Card>
        <Columns
          values={buckets.map((b) => b.work / 60)}
          stack={buckets.map((b) => b.ot / 60)}
          labels={buckets.map((b) => (mode === 'week' ? DAY_SHORT[weekday(b.key)]! : formatDate(b.key, { day: 'numeric', month: 'short' })))}
          a11y={buckets.map((b) => `${b.key}: ${formatHours(b.work)} h work, ${formatHours(b.ot)} h overtime`).join('; ')}
          height={120}
        />
        <View className="mt-2 flex-row gap-4">
          <Legend className="bg-green-600" text="Working" />
          <Legend className="bg-amber-500" text="Overtime" />
        </View>
      </Card>

      <SectionTitle>Export {formatMonth(`${month}-01`)}</SectionTitle>
      <View className="mb-6 flex-row gap-2">
        <Button title="CSV" variant="secondary" loading={busy === 'csv'} onPress={() => void exportMonth('csv')} className="flex-1" />
        <Button title="Excel (.xlsx)" variant="secondary" loading={busy === 'xlsx'} onPress={() => void exportMonth('xlsx')} className="flex-1" />
      </View>
    </View>
  );
}

function MonthGrid({
  start,
  end,
  weekStart,
  today,
  selected,
  onSelect,
  byDate,
}: {
  start: string;
  end: string;
  weekStart: 0 | 1;
  today: string;
  selected: string;
  onSelect: (d: string) => void;
  byDate: ReturnType<typeof attendanceByDate>;
}) {
  const lead = (weekday(start) - weekStart + 7) % 7;
  const cells = [...Array<null>(lead).fill(null), ...dateRange(start, end)];
  const heads = Array.from({ length: 7 }, (_, i) => DAY_SHORT[(i + weekStart) % 7]!);
  return (
    <Card>
      <View className="flex-row">
        {heads.map((h) => (
          <Text key={h} className="flex-1 text-center text-xs text-slate-500">
            {h}
          </Text>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {cells.map((d, i) => {
          if (!d) return <View key={`b${i}`} style={{ width: `${100 / 7}%` }} className="h-14" />;
          const e = byDate.get(d);
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={`${d}: ${e ? STATUS_LABEL[e.status] : 'Not marked'}${e?.status === 'present' ? ` ${formatHours(e.workMinutes)}+${formatHours(e.overtimeMinutes)} h` : ''}`}
              accessibilityState={{ selected: d === selected }}
              onPress={() => onSelect(d)}
              style={{ width: `${100 / 7}%` }}
              className="h-14 p-0.5"
            >
              <View
                className={`flex-1 items-center justify-center rounded-lg ${e ? STATUS_STYLE[e.status].cell : 'border border-slate-200 dark:border-slate-700'} ${
                  d === selected ? 'border-2 border-amber-400' : ''
                } ${d > today ? 'opacity-50' : ''}`}
              >
                <Text className={`text-xs font-semibold ${e ? 'text-white' : d === today ? 'text-brand dark:text-brand-light' : 'text-slate-700 dark:text-slate-300'}`}>
                  {parseDate(d).d}
                </Text>
                {e?.status === 'present' ? (
                  <Text className="text-[10px] text-white">
                    {formatHours(e.workMinutes)}
                    {e.overtimeMinutes ? `+${formatHours(e.overtimeMinutes)}` : ''}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const Stat = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <View className="min-h-9 flex-row items-center justify-between border-t border-slate-100 dark:border-slate-800">
    <Text className="text-sm text-slate-600 dark:text-slate-300">{label}</Text>
    <Text className={`text-base text-slate-900 dark:text-white ${bold ? 'font-bold' : ''}`}>{value}</Text>
  </View>
);

const Legend = ({ className, text }: { className: string; text: string }) => (
  <View className="flex-row items-center">
    <View className={`mr-1 h-3 w-3 rounded-sm ${className}`} />
    <Text className="text-xs text-slate-500">{text}</Text>
  </View>
);
