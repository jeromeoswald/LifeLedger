import { Schema, model, Types } from 'mongoose';

const sessionSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: ['rotated', 'logout', 'logout-all', 'reuse', 'password-reset', null], default: null },
    remember: { type: Boolean, default: true },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);
// Mongo removes sessions once they expire.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model('Session', sessionSchema);
