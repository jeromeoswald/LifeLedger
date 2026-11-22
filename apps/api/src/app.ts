import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import {
  accountSchema,
  categorySchema,
  dailyLogSchema,
  habitEntrySchema,
  habitSchema,
  recurringSchema,
  taskSchema,
  timeSessionSchema,
  transactionSchema,
} from '@lifeledger/shared';
import { env, isProd } from './env';
import { errorHandler } from './lib/http';
import { authRouter } from './routes/auth';
import { syncedRouter } from './routes/synced';
import { fxRouter } from './routes/fx';
import { attendanceRouter } from './routes/attendance';
import { exportRouter } from './routes/export';
import { syncRouter } from './routes/sync';
import { pushRouter } from './routes/push';
import { createRatesService, type RatesService } from './fx/service';
import { exchangeRateApi, frankfurter } from './fx/providers';
import { createHistoryService, frankfurterHistory } from './fx/history';
import {
  AccountModel,
  CategoryModel,
  DailyLogModel,
  HabitEntryModel,
  HabitModel,
  RecurringModel,
  TaskModel,
  TimeSessionModel,
  TransactionModel,
} from './models/synced';

export const defaultRatesService = () => createRatesService(exchangeRateApi(env.FX_PRIMARY_URL), frankfurter(env.FX_FALLBACK_URL));

export const defaultHistoryService = () => createHistoryService(frankfurterHistory(env.FX_FALLBACK_URL));

export function createApp({
  rates = defaultRatesService(),
  history = defaultHistoryService(),
}: { rates?: RatesService; history?: ReturnType<typeof createHistoryService> } = {}) {
  const app = express();
  app.set('trust proxy', 1); // behind Render's proxy: req.secure / req.ip come from X-Forwarded-*
  app.disable('x-powered-by');
  app.use(helmet()); // security headers incl. HSTS
  if (isProd) {
    // HTTPS only
    app.use((req, res, next) => (req.secure ? next() : res.redirect(308, `https://${req.headers.host}${req.originalUrl}`)));
  }
  app.use(cors({ origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true }));

  const health = (_req: express.Request, res: express.Response) => void res.json({ ok: true });
  app.get('/health', health); // for the host's health check (not rate-limited)
  app.get('/api/v1/health', health);

  app.use('/api', rateLimit({ windowMs: 60_000, limit: env.RATE_LIMIT_PER_MIN, standardHeaders: 'draft-8', legacyHeaders: false }));
  // sign-in/up/reset: much tighter (on top of the per-account lockout)
  app.use(['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/forgot-password', '/api/v1/auth/reset-password'], rateLimit({ windowMs: 15 * 60_000, limit: env.AUTH_RATE_LIMIT_PER_15MIN, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/fx', fxRouter(rates, history));
  app.use('/api/v1/tasks', syncedRouter(TaskModel, taskSchema));
  app.use('/api/v1/time-sessions', syncedRouter(TimeSessionModel, timeSessionSchema));
  app.use('/api/v1/daily-logs', syncedRouter(DailyLogModel, dailyLogSchema));
  app.use('/api/v1/habits', syncedRouter(HabitModel, habitSchema));
  app.use('/api/v1/habit-entries', syncedRouter(HabitEntryModel, habitEntrySchema));
  app.use('/api/v1/accounts', syncedRouter(AccountModel, accountSchema));
  app.use('/api/v1/categories', syncedRouter(CategoryModel, categorySchema));
  app.use('/api/v1/transactions', syncedRouter(TransactionModel, transactionSchema));
  app.use('/api/v1/recurring', syncedRouter(RecurringModel, recurringSchema));
  app.use('/api/v1/attendance', attendanceRouter);
  app.use('/api/v1/export', exportRouter);
  app.use('/api/v1/sync', syncRouter);
  app.use('/api/v1/push', pushRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
