export * from './currencies';
export * from './money';
export * from './dates';
export * from './work';
export * from './schemas/auth';
export * from './schemas/work';
export * from './schemas/habits';
export * from './habits';
export * from './fx';
export * from './wallet';
export * from './schemas/wallet';
export * from './schemas/attendance';
export * from './attendance';

export interface User {
  id: string;
  email: string;
  baseCurrency: string;
  timeZone: string;
  createdAt: string;
  /** attendance settings */
  attendanceDefaultMinutes: number;
  weekStart: 0 | 1;
  showAttendanceCard: boolean;
}

export interface AuthResponse {
  accessToken: string;
  /** Native clients only; web receives it as an httpOnly cookie. */
  refreshToken?: string;
  user: User;
}

/** Fields every synced record carries. */
export interface SyncFields {
  clientId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
