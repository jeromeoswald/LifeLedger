import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { env } from '../env';
import { HttpError } from './http';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SHORT_REFRESH_TTL_MS = 24 * 60 * 60 * 1000; // "Remember this device" off
export const REFRESH_COOKIE = 'll_refresh';

export const signAccess = (userId: string) =>
  jwt.sign({}, env.JWT_ACCESS_SECRET, { subject: userId, expiresIn: ACCESS_TTL_SEC, algorithm: 'HS256' });

export const newRefreshToken = () => randomBytes(48).toString('base64url');

/** Keyed hash: a leaked sessions collection alone can't be replayed. Also used for reset codes. */
export const keyedHash = (value: string) =>
  createHmac('sha256', env.JWT_REFRESH_SECRET).update(value).digest('hex');

export const hashesEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) throw new Error('bad token');
    res.locals.userId = payload.sub;
    next();
  } catch {
    next(new HttpError(401, 'Not signed in'));
  }
};
