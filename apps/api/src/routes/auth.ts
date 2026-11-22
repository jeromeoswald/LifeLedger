import { randomInt } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  updateMeSchema,
  type AuthResponse,
} from '@lifeledger/shared';
import { env, isProd } from '../env';
import { UserModel, toUserDto, type UserDoc } from '../models/User';
import { SessionModel } from '../models/Session';
import { HttpError } from '../lib/http';
import { mailer } from '../lib/mailer';
import {
  REFRESH_COOKIE,
  REFRESH_TTL_MS,
  SHORT_REFRESH_TTL_MS,
  hashesEqual,
  keyedHash,
  newRefreshToken,
  requireAuth,
  signAccess,
} from '../lib/tokens';

const BCRYPT_COST = env.NODE_ENV === 'test' ? 4 : 12;
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 10 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;
const RESET_RESEND_GAP_MS = 60 * 1000;
const ROTATION_GRACE_MS = 10 * 1000;
// Compared against when the email is unknown, so timing doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

export const authRouter = Router();

const isWeb = (req: Request) => req.get('x-client') === 'web';

const cookieOpts = (remember: boolean) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  ...(remember ? { maxAge: REFRESH_TTL_MS } : {}), // no maxAge = browser-session cookie
});

async function startSession(req: Request, res: Response, user: UserDoc, remember: boolean, status = 200) {
  const refreshToken = newRefreshToken();
  await SessionModel.create({
    userId: user._id,
    tokenHash: keyedHash(refreshToken),
    expiresAt: new Date(Date.now() + (remember ? REFRESH_TTL_MS : SHORT_REFRESH_TTL_MS)),
    remember,
    userAgent: req.get('user-agent')?.slice(0, 200) ?? '',
  });
  const body: AuthResponse = { accessToken: signAccess(user.id as string), user: toUserDto(user) };
  if (isWeb(req)) res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts(remember));
  else body.refreshToken = refreshToken;
  res.status(status).json(body);
}

const readRefreshToken = (req: Request): string => {
  const t = isWeb(req) ? req.cookies?.[REFRESH_COOKIE] : req.body?.refreshToken;
  return typeof t === 'string' ? t : '';
};

const revokeAll = (userId: unknown, reason: string) =>
  SessionModel.updateMany({ userId, revokedAt: null }, { revokedAt: new Date(), revokedReason: reason });

authRouter.post('/register', async (req, res) => {
  const input = signUpSchema.parse(req.body);
  if (await UserModel.exists({ email: input.email })) throw new HttpError(409, 'An account with this email already exists');
  const user = await UserModel.create({
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
    baseCurrency: input.baseCurrency,
  });
  await startSession(req, res, user, true, 201);
});

authRouter.post('/login', async (req, res) => {
  const input = signInSchema.parse(req.body);
  const user = await UserModel.findOne({ email: input.email, deletedAt: null });
  const now = Date.now();

  if (user?.lockUntil && user.lockUntil.getTime() > now) {
    const retry = Math.ceil((user.lockUntil.getTime() - now) / 1000);
    throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(retry / 60)} min.`, { 'Retry-After': String(retry) });
  }

  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      const inWindow = user.firstFailedAt && now - user.firstFailedAt.getTime() < WINDOW_MS;
      user.failedLogins = inWindow ? user.failedLogins + 1 : 1;
      if (!inWindow) user.firstFailedAt = new Date(now);
      if (user.failedLogins >= MAX_FAILS) {
        user.lockUntil = new Date(now + LOCK_MS);
        user.failedLogins = 0;
        user.firstFailedAt = null;
      }
      await user.save();
      if (user.lockUntil && user.lockUntil.getTime() > now) {
        throw new HttpError(429, 'Too many attempts. Try again in 15 min.', { 'Retry-After': String(LOCK_MS / 1000) });
      }
    }
    throw new HttpError(401, 'Email or password is incorrect');
  }

  user.failedLogins = 0;
  user.firstFailedAt = null;
  user.lockUntil = null;
  await user.save();
  await startSession(req, res, user, input.rememberDevice);
});

authRouter.post('/refresh', async (req, res) => {
  const token = readRefreshToken(req);
  if (!token) throw new HttpError(401, 'Not signed in');
  const session = await SessionModel.findOne({ tokenHash: keyedHash(token) });
  if (!session || session.expiresAt.getTime() <= Date.now()) throw new HttpError(401, 'Session expired');

  if (session.revokedAt) {
    // A rotated token used again outside the short race window = likely stolen: kill every session.
    // Logged-out tokens just fail; only a replayed *rotated* token signals theft.
    const stolen = session.revokedReason === 'rotated' && Date.now() - session.revokedAt.getTime() >= ROTATION_GRACE_MS;
    if (stolen) await revokeAll(session.userId, 'reuse');
    throw new HttpError(401, 'Session expired');
  }

  // Atomic claim so two concurrent refreshes can't both rotate the same token.
  const claimed = await SessionModel.findOneAndUpdate(
    { _id: session._id, revokedAt: null },
    { revokedAt: new Date(), revokedReason: 'rotated' },
  );
  if (!claimed) throw new HttpError(401, 'Session expired');

  const user = await UserModel.findOne({ _id: session.userId, deletedAt: null });
  if (!user) throw new HttpError(401, 'Session expired');
  await startSession(req, res, user, session.remember);
});

authRouter.post('/logout', async (req, res) => {
  const token = readRefreshToken(req);
  if (token) {
    await SessionModel.updateOne(
      { tokenHash: keyedHash(token), revokedAt: null },
      { revokedAt: new Date(), revokedReason: 'logout' },
    );
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.status(204).end();
});

authRouter.post('/logout-all', requireAuth, async (_req, res) => {
  await revokeAll(res.locals.userId, 'logout-all');
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.status(204).end();
});

authRouter.post('/forgot-password', async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  const user = await UserModel.findOne({ email, deletedAt: null });
  const now = Date.now();
  const recentlySent = user?.resetCodeExpires && user.resetCodeExpires.getTime() - RESET_TTL_MS > now - RESET_RESEND_GAP_MS;
  if (user && !recentlySent) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    user.resetCodeHash = keyedHash(`${user.id}:${code}`);
    user.resetCodeExpires = new Date(now + RESET_TTL_MS);
    user.resetAttempts = 0;
    await user.save();
    await mailer.sendResetCode(user.email, code);
  }
  // Same response either way so it can't be used to probe for accounts.
  res.json({ ok: true });
});

authRouter.post('/reset-password', async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);
  const user = await UserModel.findOne({ email: input.email, deletedAt: null });
  const invalid = new HttpError(400, 'Code is invalid or expired');
  if (!user?.resetCodeHash || !user.resetCodeExpires || user.resetCodeExpires.getTime() <= Date.now()) throw invalid;
  if (user.resetAttempts >= RESET_MAX_ATTEMPTS) throw invalid;

  if (!hashesEqual(keyedHash(`${user.id}:${input.code}`), user.resetCodeHash)) {
    user.resetAttempts += 1;
    await user.save();
    throw invalid;
  }

  user.passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
  user.resetCodeHash = null;
  user.resetCodeExpires = null;
  user.resetAttempts = 0;
  user.failedLogins = 0;
  user.firstFailedAt = null;
  user.lockUntil = null;
  await user.save();
  await revokeAll(user._id, 'password-reset');
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (_req, res) => {
  const user = await UserModel.findOne({ _id: res.locals.userId, deletedAt: null });
  if (!user) throw new HttpError(401, 'Not signed in');
  res.json({ user: toUserDto(user) });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const input = updateMeSchema.parse(req.body);
  const user = await UserModel.findOneAndUpdate({ _id: res.locals.userId, deletedAt: null }, { ...input, settingsUpdatedAt: new Date() }, { new: true });
  if (!user) throw new HttpError(401, 'Not signed in');
  res.json({ user: toUserDto(user) });
});
