import { Schema, model, Types, type SchemaDefinition } from 'mongoose';

/**
 * A user-owned record that syncs: client-generated clientId, client timestamps (latest updatedAt
 * wins), soft delete via deletedAt. Timestamps come from the client, so Mongoose's are off.
 */
export function syncedModel(name: string, fields: SchemaDefinition, unique?: Record<string, 1>) {
  const schema = new Schema(
    {
      userId: { type: Types.ObjectId, ref: 'User', required: true },
      clientId: { type: String, required: true },
      createdAt: { type: Date, required: true },
      updatedAt: { type: Date, required: true },
      deletedAt: { type: Date, default: null },
      /** server time of the last write; POST /sync pulls "syncedAt > lastSyncedAt" */
      syncedAt: { type: Date, default: () => new Date() },
      ...fields,
    },
    { timestamps: false, minimize: false, versionKey: false },
  );
  schema.index({ userId: 1, clientId: 1 }, { unique: true });
  schema.index({ userId: 1, syncedAt: 1 });
  if (unique) schema.index(unique, { unique: true });
  return model(name, schema);
}

const mixed = (def: unknown) => ({ type: Schema.Types.Mixed, default: def });

export const TaskModel = syncedModel('Task', {
  title: { type: String, required: true },
  notes: { type: String, default: '' },
  project: { type: String, default: '' },
  priority: { type: String, default: 'medium' },
  status: { type: String, default: 'todo' },
  dueDate: { type: String, default: null },
  dueTime: { type: String, default: null },
  estimateMin: { type: Number, default: null },
  recurrence: mixed(null),
  alarms: mixed([]),
  completedAt: { type: Date, default: null },
});

export const TimeSessionModel = syncedModel('TimeSession', {
  taskId: { type: String, required: true },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date, default: null },
});

export const HabitModel = syncedModel('Habit', {
  name: { type: String, required: true },
  type: { type: String, required: true },
  target: { type: Number, default: 1 },
  unit: { type: String, default: '' },
  schedule: mixed({ kind: 'daily' }),
  reminderTime: { type: String, default: null },
  startDate: { type: String, required: true },
  archivedAt: { type: Date, default: null },
});

export const HabitEntryModel = syncedModel('HabitEntry', {
  habitId: { type: String, required: true },
  date: { type: String, required: true },
  value: { type: Number, default: 0 },
  note: { type: String, default: '' },
});

export const AccountModel = syncedModel('Account', {
  name: { type: String, required: true },
  type: { type: String, required: true },
  currency: { type: String, required: true },
  openingBalanceMinor: { type: Number, default: 0 },
  archivedAt: { type: Date, default: null },
});

export const CategoryModel = syncedModel('Category', {
  name: { type: String, required: true },
  kind: { type: String, required: true },
  icon: { type: String, default: '' },
  monthlyBudgetMinor: { type: Number, default: null },
  budgetCurrency: { type: String, default: null },
  archivedAt: { type: Date, default: null },
});

export const TransactionModel = syncedModel('Transaction', {
  type: { type: String, required: true },
  date: { type: String, required: true },
  accountId: { type: String, required: true },
  amountMinor: { type: Number, required: true },
  currency: { type: String, required: true },
  accountAmountMinor: { type: Number, required: true },
  categoryId: { type: String, default: null },
  note: { type: String, default: '' },
  toAccountId: { type: String, default: null },
  toAmountMinor: { type: Number, default: null },
  toCurrency: { type: String, default: null },
  effectiveRate: { type: String, default: null },
  baseCurrency: { type: String, required: true },
  fxRateToBase: { type: String, required: true },
  amountBaseMinor: { type: Number, required: true },
  rateDate: { type: String, required: true },
  rateSource: { type: String, required: true },
  recurringId: { type: String, default: null },
});

export const RecurringModel = syncedModel('Recurring', {
  template: mixed(null),
  recurrence: mixed(null),
  nextDate: { type: String, required: true },
  pausedAt: { type: Date, default: null },
});

export const AttendanceModel = syncedModel(
  'Attendance',
  {
    date: { type: String, required: true },
    status: { type: String, required: true },
    workMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    note: { type: String, default: '' },
  },
  { userId: 1, date: 1 }, // one entry per user per day; PUT /attendance/:date upserts on this key
);

export const DailyLogModel = syncedModel('DailyLog', {
  date: { type: String, required: true },
  done: { type: String, default: '' },
  blockers: { type: String, default: '' },
  tomorrow: { type: String, default: '' },
});
