import { env } from './env';
import { connectDb } from './db';
import { createApp, defaultRatesService } from './app';
import { scheduleDailyRefresh } from './fx/service';

try {
  await connectDb();
} catch (err) {
  console.error(`Could not connect to MongoDB at ${env.MONGODB_URI}. Is it running?\n`, err);
  process.exit(1);
}

const rates = defaultRatesService();
scheduleDailyRefresh(rates); // 06:00 Asia/Dubai
// Warm the cache at start-up so the first request is fast (failures are fine: retried on demand).
rates.latest().catch((e) => console.warn('[fx] initial fetch failed:', (e as Error).message));

// 0.0.0.0 so a phone on the same Wi-Fi can reach it.
createApp({ rates }).listen(env.PORT, '0.0.0.0', () => {
  console.log(`LifeLedger API listening on http://localhost:${env.PORT}`);
});
