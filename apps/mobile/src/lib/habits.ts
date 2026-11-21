import type { Habit, HabitEntry } from '@lifeledger/shared';
import { getCached, newBase, nowIso, removeRecord, saveRecord, useList } from './records';

export const useHabits = () => useList<Habit>('habits');
export const useHabitEntries = () => useList<HabitEntry>('habit-entries');

/** Sets the value for a habit on a local date (0 = not done). Edits past days the same way. */
// shortcut: one entry per habit+date on this device; two devices are reconciled by latest edit (habitValues).
const entryFor = (habit: Habit, date: string): HabitEntry =>
  getCached<HabitEntry>('habit-entries').find((e) => e.habitId === habit.clientId && e.date === date && !e.deletedAt) ?? {
    ...newBase(),
    habitId: habit.clientId,
    date,
    value: 0,
    note: '',
  };

/** Sets the value for a habit on a local date (0 = not done). Edits past days the same way; keeps the note. */
export function setHabitValue(habit: Habit, date: string, value: number) {
  return saveRecord<HabitEntry>('habit-entries', { ...entryFor(habit, date), value: Math.max(0, Math.round(value)) });
}

/** Saves the day's note (e.g. "Pages 45–72"); keeps the value. */
export function setHabitNote(habit: Habit, date: string, note: string) {
  return saveRecord<HabitEntry>('habit-entries', { ...entryFor(habit, date), note: note.trim().slice(0, 500) });
}

/** The "one tap": yes/no toggles; count adds 1; duration adds 5 minutes. */
export function quickCheckIn(habit: Habit, date: string, current: number) {
  if (habit.type === 'yesno') return setHabitValue(habit, date, current ? 0 : 1);
  return setHabitValue(habit, date, current + (habit.type === 'count' ? 1 : 5));
}

export const archiveHabit = (h: Habit, archived: boolean) => saveRecord('habits', { ...h, archivedAt: archived ? nowIso() : null });
export const deleteHabit = (h: Habit) => removeRecord('habits', h.clientId);

export function formatHabitValue(h: Pick<Habit, 'type' | 'target' | 'unit'>, value: number) {
  if (h.type === 'yesno') return value ? 'Done' : 'Not done';
  const unit = h.unit || (h.type === 'duration' ? 'min' : '');
  return `${value}/${h.target}${unit ? ` ${unit}` : ''}`;
}
