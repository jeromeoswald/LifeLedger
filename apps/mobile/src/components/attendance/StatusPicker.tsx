import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ATTENDANCE_STATUSES, STATUS_LABEL, attendanceDateError, type Attendance, type AttendanceStatus } from '@lifeledger/shared';
import { ConfirmModal } from '@/components/ConfirmModal';
import { entryWithStatus, setStatusWithUndo } from '@/lib/attendance';

export const STATUS_STYLE: Record<AttendanceStatus, { icon: string; on: string; cell: string; text: string }> = {
  present: { icon: '✓', on: 'border-green-600 bg-green-600', cell: 'bg-green-600', text: 'text-green-700 dark:text-green-400' },
  off: { icon: '☕', on: 'border-slate-500 bg-slate-500', cell: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-300' },
  absent: { icon: '✕', on: 'border-red-600 bg-red-600', cell: 'bg-red-600', text: 'text-red-600 dark:text-red-400' },
  sick: { icon: '🤒', on: 'border-orange-500 bg-orange-500', cell: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
};

/**
 * The 4 status buttons. Every tap auto-saves (with Undo). Present starts at the default hours.
 * Leaving Present with hours asks first, because it clears them.
 */
export function StatusPicker({ date, today, entry, defaultMinutes }: { date: string; today: string; entry: Attendance | undefined; defaultMinutes: number }) {
  const [pending, setPending] = useState<AttendanceStatus | null>(null);

  const apply = (status: AttendanceStatus) => void setStatusWithUndo(entryWithStatus(date, status, entry, defaultMinutes), entry);
  const pick = (status: AttendanceStatus) => {
    if (entry?.status === status) return;
    const hasHours = entry?.status === 'present' && entry.workMinutes + entry.overtimeMinutes > 0;
    if (hasHours) setPending(status);
    else apply(status);
  };

  return (
    <View>
      <View accessibilityRole="radiogroup" accessibilityLabel={`Attendance for ${date}`} className="flex-row gap-2">
        {ATTENDANCE_STATUSES.map((s) => {
          const selected = entry?.status === s;
          const disabled = !!attendanceDateError(date, s, today);
          const st = STATUS_STYLE[s];
          return (
            <Pressable
              key={s}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${STATUS_LABEL[s]}${disabled ? ', not allowed for future days' : ''}`}
              disabled={disabled}
              onPress={() => pick(s)}
              className={`min-h-16 flex-1 items-center justify-center rounded-xl border-2 px-1 ${
                selected ? st.on : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
              } ${disabled ? 'opacity-30' : ''}`}
            >
              <Text className={`text-lg ${selected ? 'text-white' : st.text}`}>{st.icon}</Text>
              <Text numberOfLines={1} className={`text-xs font-semibold ${selected ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                {STATUS_LABEL[s]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ConfirmModal
        visible={pending !== null}
        title="Clear the hours?"
        message={`Switching to ${pending ? STATUS_LABEL[pending] : ''} clears the working and overtime hours for this day.`}
        confirmLabel="Switch"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) apply(pending);
          setPending(null);
        }}
      />
    </View>
  );
}
