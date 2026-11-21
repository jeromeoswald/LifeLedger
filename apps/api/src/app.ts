import express from 'express';
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
import { env } from './env';
import { errorHandler } from './lib/http';
import { authRouter } from './routes/auth';
import { syncedRouter } from './routes/synced';
import { fxRouter } from './routes/fx';
import { createRatesService, type RatesService } from './fx/service';
import { exchangeRateApi, frankfurter } from './fx/providers';
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

export function createApp({ rates = defaultRatesService() }: { rates?: RatesService } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors({ origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/fx', fxRouter(rates));
  app.use('/api/v1/tasks', syncedRouter(TaskModel, taskSchema));
  app.use('/api/v1/time-sessions', syncedRouter(TimeSessionModel, timeSessionSchema));
  app.use('/api/v1/daily-logs', syncedRouter(DailyLogModel, dailyLogSchema));
  app.use('/api/v1/habits', syncedRouter(HabitModel, habitSchema));
  app.use('/api/v1/habit-entries', syncedRouter(HabitEntryModel, habitEntrySchema));
  app.use('/api/v1/accounts', syncedRouter(AccountModel, accountSchema));
  app.use('/api/v1/categories', syncedRouter(CategoryModel, categorySchema));
  app.use('/api/v1/transactions', syncedRouter(TransactionModel, transactionSchema));
  app.use('/api/v1/recurring', syncedRouter(RecurringModel, recurringSchema));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
