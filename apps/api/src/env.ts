import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  CORS_ORIGINS: z.string().default('http://localhost:8081'),
  FX_PRIMARY_URL: z.url().default('https://open.er-api.com/v6/latest/USD'),
  FX_FALLBACK_URL: z.url().default('https://api.frankfurter.dev/v1'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(600),
  AUTH_RATE_LIMIT_PER_15MIN: z.coerce.number().int().positive().default(50),
  /** public web app URL (Web Push subject + links); optional in dev */
  WEB_URL: z.url().default('http://localhost:8081'),
  /** VAPID keys for Web Push; generated and stored in MongoDB on first start if not set */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment. Copy apps/api/.env.example to apps/api/.env.\n', z.prettifyError(parsed.error));
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
