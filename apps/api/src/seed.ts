import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { addDays, localDate, weekday } from '@lifeledger/shared';
import { connectDb } from './db';
import { UserModel } from './models/User';
import { AccountModel, AttendanceModel, CategoryModel, HabitEntryModel, HabitModel, TaskModel, TransactionModel } from './models/synced';

// Re-runnable: fixed clientIds + $setOnInsert never duplicate or overwrite your edits.
const EMAIL = 'demo@lifeledger.app';
const PASSWORD = 'Demo1234!';
const TZ = 'Asia/Dubai';

await connectDb();
await UserModel.updateOne(
  { email: EMAIL },
  { $setOnInsert: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 12), baseCurrency: 'AED', timeZone: TZ } },
  { upsert: true },
);
const user = await UserModel.findOne({ email: EMAIL }).orFail();

const today = localDate(new Date(), TZ);
const now = new Date();
const tasks = [
  { n: 1, title: 'Send weekly status report', project: 'Work', priority: 'high', dueDate: addDays(today, -1), dueTime: '17:00', estimateMin: 30 },
  { n: 2, title: 'Review pull requests', project: 'Work', priority: 'urgent', dueDate: today, dueTime: '11:00', estimateMin: 60 },
  { n: 3, title: 'Pay DEWA bill', project: 'Home', priority: 'medium', dueDate: today, dueTime: null, estimateMin: 10 },
  { n: 4, title: 'Plan LifeLedger habits module', project: 'LifeLedger', priority: 'medium', dueDate: null, dueTime: null, estimateMin: 90, status: 'in_progress' },
  {
    n: 5,
    title: 'Daily stand-up notes',
    project: 'Work',
    priority: 'low',
    dueDate: today,
    dueTime: '09:30',
    estimateMin: 15,
    recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], monthDay: null },
  },
];

for (const { n, ...t } of tasks) {
  await TaskModel.updateOne(
    { userId: user._id, clientId: `5eed0000-0000-4000-8000-00000000000${n}` },
    { $setOnInsert: { status: 'todo', notes: '', alarms: [], recurrence: null, completedAt: null, ...t, createdAt: now, updatedAt: now, deletedAt: null } },
    { upsert: true },
  );
}

const habits = [
  { n: 1, name: 'Drink water', type: 'count', target: 8, unit: 'glasses', schedule: { kind: 'daily' }, reminderTime: '10:00' },
  { n: 2, name: 'Read', type: 'duration', target: 20, unit: 'min', schedule: { kind: 'daily' }, reminderTime: '21:30' },
  { n: 3, name: 'Gym', type: 'yesno', target: 1, unit: '', schedule: { kind: 'perWeek', times: 3 }, reminderTime: null },
];
const habitId = (n: number) => `5eed0001-0000-4000-8000-00000000000${n}`;
for (const { n, ...h } of habits) {
  await HabitModel.updateOne(
    { userId: user._id, clientId: habitId(n) },
    { $setOnInsert: { ...h, startDate: addDays(today, -20), archivedAt: null, createdAt: now, updatedAt: now, deletedAt: null } },
    { upsert: true },
  );
}
// Two weeks of sample check-ins so streaks and the heatmap have something to show.
const pattern: Record<number, (dayOffset: number) => number> = {
  1: (d) => (d % 6 === 5 ? 5 : 8), // water: one short day a week
  2: (d) => (d === 3 ? 0 : 25), // reading: missed once
  3: (d) => ([1, 3, 6, 8, 10, 13].includes(d) ? 1 : 0), // gym ~3x a week
};
let entryCount = 0;
for (const { n } of habits) {
  for (let d = 1; d <= 14; d++) {
    const value = pattern[n]!(d);
    if (!value) continue;
    await HabitEntryModel.updateOne(
      { userId: user._id, clientId: `5eed0002-0000-4000-8${n}00-0000000000${String(d).padStart(2, '0')}` },
      { $setOnInsert: { habitId: habitId(n), date: addDays(today, -d), value, createdAt: now, updatedAt: now, deletedAt: null } },
      { upsert: true },
    );
    entryCount++;
  }
}

// ---------- wallet ----------
const accId = (n: number) => `5eed0003-0000-4000-8000-00000000000${n}`;
const accounts = [
  { n: 1, name: 'Cash', type: 'cash', currency: 'AED', openingBalanceMinor: 800_00 },
  { n: 2, name: 'Bank AED', type: 'bank', currency: 'AED', openingBalanceMinor: 15_000_00 },
  { n: 3, name: 'Bank INR', type: 'bank', currency: 'INR', openingBalanceMinor: 120_000_00 },
];
for (const { n, ...a } of accounts) {
  await AccountModel.updateOne(
    { userId: user._id, clientId: accId(n) },
    { $setOnInsert: { ...a, archivedAt: null, createdAt: now, updatedAt: now, deletedAt: null } },
    { upsert: true },
  );
}

const catId = (n: number) => `5eed0004-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const categories = [
  { n: 1, name: 'Groceries', kind: 'expense', icon: '🛒', monthlyBudgetMinor: 1_500_00 },
  { n: 2, name: 'Dining', kind: 'expense', icon: '🍽️', monthlyBudgetMinor: 800_00 },
  { n: 3, name: 'Transport', kind: 'expense', icon: '🚕', monthlyBudgetMinor: 500_00 },
  { n: 4, name: 'Rent', kind: 'expense', icon: '🏠', monthlyBudgetMinor: null },
  { n: 5, name: 'Utilities', kind: 'expense', icon: '💡', monthlyBudgetMinor: 600_00 },
  { n: 6, name: 'Shopping', kind: 'expense', icon: '🛍️', monthlyBudgetMinor: null },
  { n: 7, name: 'Salary', kind: 'income', icon: '💼', monthlyBudgetMinor: null },
  { n: 8, name: 'Freelance', kind: 'income', icon: '💻', monthlyBudgetMinor: null },
];
for (const { n, ...c } of categories) {
  await CategoryModel.updateOne(
    { userId: user._id, clientId: catId(n) },
    {
      $setOnInsert: { ...c, budgetCurrency: c.monthlyBudgetMinor ? 'AED' : null, archivedAt: null, createdAt: now, updatedAt: now, deletedAt: null },
    },
    { upsert: true },
  );
}

// AED-only samples (rate 1), so no live rate is needed to seed. The app fetches real rates for everything else.
const samples = [
  { n: 1, type: 'income', d: 20, acc: 2, cat: 7, amt: 18_000_00, note: 'November salary' },
  { n: 2, type: 'expense', d: 18, acc: 2, cat: 4, amt: 6_500_00, note: 'Rent' },
  { n: 3, type: 'expense', d: 6, acc: 1, cat: 1, amt: 412_50, note: 'Carrefour' },
  { n: 4, type: 'expense', d: 4, acc: 2, cat: 1, amt: 830_25, note: 'Lulu weekly shop' },
  { n: 5, type: 'expense', d: 3, acc: 1, cat: 2, amt: 145_00, note: 'Lunch' },
  { n: 6, type: 'expense', d: 2, acc: 2, cat: 3, amt: 62_00, note: 'Careem' },
  { n: 7, type: 'expense', d: 1, acc: 2, cat: 5, amt: 540_00, note: 'DEWA' },
];
for (const s of samples) {
  await TransactionModel.updateOne(
    { userId: user._id, clientId: `5eed0005-0000-4000-8000-0000000000${String(s.n).padStart(2, '0')}` },
    {
      $setOnInsert: {
        type: s.type,
        date: addDays(today, -s.d),
        accountId: accId(s.acc),
        amountMinor: s.amt,
        currency: 'AED',
        accountAmountMinor: s.amt,
        categoryId: catId(s.cat),
        note: s.note,
        toAccountId: null,
        toAmountMinor: null,
        toCurrency: null,
        effectiveRate: null,
        baseCurrency: 'AED',
        fxRateToBase: '1',
        amountBaseMinor: s.amt,
        rateDate: addDays(today, -s.d),
        rateSource: 'seed',
        recurringId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    },
    { upsert: true },
  );
}

// ---------- attendance: the last 14 days (today is left for you to mark) ----------
let attendanceCount = 0;
for (let d = 1; d <= 14; d++) {
  const date = addDays(today, -d);
  const wd = weekday(date);
  const weekend = wd === 0 || wd === 6; // UAE weekend: Sat–Sun
  const status = weekend ? 'off' : d === 9 ? 'sick' : 'present';
  const present = status === 'present';
  const r = await AttendanceModel.updateOne(
    { userId: user._id, date },
    {
      $setOnInsert: {
        clientId: `5eed0006-0000-4000-8000-0000000000${String(d).padStart(2, '0')}`,
        status,
        workMinutes: present ? 480 : 0,
        overtimeMinutes: present && d % 3 === 0 ? 120 : 0, // some overtime
        note: d === 9 ? 'Flu' : '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    },
    { upsert: true },
  );
  attendanceCount += r.upsertedCount;
}

console.log(`Seeded demo user: ${EMAIL} / ${PASSWORD}`);
console.log(`Seeded ${attendanceCount} attendance days (existing days left untouched).`);
console.log(`Seeded ${tasks.length} sample tasks, ${habits.length} habits, ${entryCount} habit check-ins.`);
console.log(`Seeded ${accounts.length} accounts, ${categories.length} categories, ${samples.length} transactions.`);
await mongoose.disconnect();
