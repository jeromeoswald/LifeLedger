import { Schema, model, Types } from 'mongoose';
import * as webpush from 'web-push'; // CommonJS package: no default export under ESM
import { alarmTime, isScheduled, localDate, localTime, type Alarm, type Habit, type Task } from '@lifeledger/shared';
import { env } from '../env';
import { HabitModel, TaskModel } from '../models/synced';
import { UserModel } from '../models/User';

/** A browser's Web Push subscription (one user can have several browsers). */
export const PushSubscriptionModel = model(
  'PushSubscription',
  new Schema(
    {
      userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
      endpoint: { type: String, required: true, unique: true },
      keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
      createdAt: { type: Date, default: () => new Date() },
    },
    { versionKey: false },
  ),
);

/** "Sent" markers so a notification goes out once, even if the job runs twice. Expire after 2 days. */
const PushLogModel = model(
  'PushLog',
  new Schema({ _id: { type: String }, at: { type: Date, default: () => new Date(), expires: 2 * 24 * 3600 } }, { versionKey: false }),
);

const ConfigModel = model('Config', new Schema({ _id: String, value: Schema.Types.Mixed }, { versionKey: false }));

let vapid: { publicKey: string; privateKey: string } | null = null;
/** VAPID keys: from env if set, else generated once and kept in MongoDB (no secret to copy around). */
export async function vapidKeys() {
  if (vapid) return vapid;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  else {
    const saved = await ConfigModel.findById('vapid').lean<{ value: { publicKey: string; privateKey: string } }>();
    vapid = saved?.value ?? webpush.generateVAPIDKeys();
    if (!saved) await ConfigModel.updateOne({ _id: 'vapid' }, { $setOnInsert: { value: vapid } }, { upsert: true });
  }
  // push services require an https: or mailto: contact; the dev URL is http, so fall back to the project page
  const subject = env.WEB_URL.startsWith('https://') ? env.WEB_URL : 'https://github.com/jeromeoswald/LifeLedger';
  webpush.setVapidDetails(subject, vapid.publicKey, vapid.privateKey);
  return vapid;
}

export interface DuePush {
  id: string;
  title: string;
  body: string;
  url: string;
}

/** Task alarms and habit reminders that fall in (from, to]. Pure, so it can be tested. */
export function duePushes(tasks: Task[], habits: Habit[], tz: string, from: Date, to: Date): DuePush[] {
  const out: DuePush[] = [];
  const inWindow = (t: Date | null) => !!t && t > from && t <= to;
  for (const t of tasks) {
    if (t.deletedAt || t.status === 'done') continue;
    for (const a of t.alarms as Alarm[]) {
      const when = alarmTime(t, a, tz);
      if (inWindow(when)) {
        out.push({
          id: `task:${t.clientId}:${a.id}:${when!.toISOString()}`,
          title: t.title,
          body: a.kind === 'before' ? `Due ${t.dueTime ?? ''}${a.minutesBefore ? ` · in ${a.minutesBefore} min` : ''}` : 'Reminder',
          url: `/task/${t.clientId}`,
        });
      }
    }
  }
  for (const h of habits) {
    if (h.deletedAt || h.archivedAt || !h.reminderTime) continue;
    // check today and the window start's day (a window can cross midnight)
    for (const day of new Set([localDate(from, tz), localDate(to, tz)])) {
      if (!isScheduled(h, day)) continue;
      const fromLocal = `${localDate(from, tz)} ${localTime(from, tz)}`;
      const toLocal = `${localDate(to, tz)} ${localTime(to, tz)}`;
      const at = `${day} ${h.reminderTime}`;
      if (at > fromLocal && at <= toLocal) out.push({ id: `habit:${h.clientId}:${day}`, title: h.name, body: 'Time to check in', url: `/habit/${h.clientId}` });
    }
  }
  return out;
}

type Sender = (sub: webpush.PushSubscription, payload: string) => Promise<unknown>;

/** One scheduler tick: send everything due in (from, to] to every subscribed browser, once. */
export async function runPushTick(from: Date, to: Date, send: Sender = (s, p) => webpush.sendNotification(s, p, { TTL: 3600 })) {
  await vapidKeys();
  const userIds = await PushSubscriptionModel.distinct('userId');
  let sent = 0;
  for (const userId of userIds) {
    const user = await UserModel.findOne({ _id: userId, deletedAt: null }).lean();
    if (!user) continue;
    const [tasks, habits] = await Promise.all([
      TaskModel.find({ userId, deletedAt: null, 'alarms.0': { $exists: true } }).lean<Task[]>(),
      HabitModel.find({ userId, deletedAt: null, reminderTime: { $ne: null } }).lean<Habit[]>(),
    ]);
    const due = duePushes(
      tasks.map((t) => ({ ...t, deletedAt: null })),
      habits.map((h) => ({ ...h, deletedAt: null, archivedAt: h.archivedAt ? String(h.archivedAt) : null })),
      user.timeZone,
      from,
      to,
    );
    if (!due.length) continue;
    const subs = await PushSubscriptionModel.find({ userId }).lean();
    for (const d of due) {
      try {
        await PushLogModel.create({ _id: `${String(userId)}:${d.id}` });
      } catch {
        continue; // already sent
      }
      for (const s of subs) {
        try {
          await send({ endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } }, JSON.stringify({ title: d.title, body: d.body, url: d.url, tag: d.id }));
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await PushSubscriptionModel.deleteOne({ endpoint: s.endpoint }); // browser unsubscribed
          else console.warn('[push] send failed:', (e as Error).message);
        }
      }
    }
  }
  return sent;
}

/** Runs every minute. On Render's free plan the server sleeps when idle, and pushes due meanwhile are skipped. */
export function startPushScheduler() {
  let last = new Date(Date.now() - 60_000);
  const tick = async () => {
    const now = new Date();
    try {
      await runPushTick(last, now);
    } catch (e) {
      console.warn('[push] tick failed:', (e as Error).message);
    }
    last = now;
  };
  setInterval(() => void tick(), 60_000).unref();
}
