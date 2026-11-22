import { randomUUID } from 'node:crypto';
import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { User as UserDto } from '@lifeledger/shared';

const userSchema = new Schema(
  {
    clientId: { type: String, default: () => randomUUID(), unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    baseCurrency: { type: String, required: true, default: 'AED' },
    timeZone: { type: String, required: true, default: 'Asia/Dubai' },
    // attendance settings
    attendanceDefaultMinutes: { type: Number, default: 480 },
    weekStart: { type: Number, default: 1 }, // 1 = Monday, 0 = Sunday
    showAttendanceCard: { type: Boolean, default: true },
    settingsUpdatedAt: { type: Date, default: null }, // latest-wins for settings edited offline
    // sign-in lockout
    failedLogins: { type: Number, default: 0 },
    firstFailedAt: { type: Date, default: null },
    lockUntil: { type: Date, default: null },
    // password reset
    resetCodeHash: { type: String, default: null },
    resetCodeExpires: { type: Date, default: null },
    resetAttempts: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const UserModel = model('User', userSchema);

export const toUserDto = (u: UserDoc): UserDto => ({
  id: u.id as string,
  email: u.email,
  baseCurrency: u.baseCurrency,
  timeZone: u.timeZone,
  createdAt: u.createdAt.toISOString(),
  attendanceDefaultMinutes: u.attendanceDefaultMinutes ?? 480,
  weekStart: u.weekStart === 0 ? 0 : 1,
  showAttendanceCard: u.showAttendanceCard ?? true,
});
