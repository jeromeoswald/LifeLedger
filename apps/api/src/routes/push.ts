import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/tokens';
import { PushSubscriptionModel, vapidKeys } from '../push/push';

const subscription = z.object({
  endpoint: z.url().refine((u) => u.startsWith('https://'), 'Push endpoints must be https'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export const pushRouter = Router();
pushRouter.use(requireAuth);

pushRouter.get('/public-key', async (_req, res) => {
  res.json({ publicKey: (await vapidKeys()).publicKey });
});

/** Save this browser's subscription (re-subscribing moves it to the current user). */
pushRouter.post('/subscribe', async (req, res) => {
  const s = subscription.parse(req.body);
  await PushSubscriptionModel.updateOne({ endpoint: s.endpoint }, { userId: res.locals.userId, keys: s.keys }, { upsert: true });
  res.status(201).json({ ok: true });
});

pushRouter.post('/unsubscribe', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
  await PushSubscriptionModel.deleteOne({ endpoint, userId: res.locals.userId });
  res.status(204).end();
});
