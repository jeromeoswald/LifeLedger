import { z } from 'zod';
import { isCurrencyCode } from '../currencies';

export const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));
export const password = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128, 'At most 128 characters');
export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isCurrencyCode, 'Unknown currency');

export const signUpSchema = z.object({
  email,
  password,
  baseCurrency: currencyCode.default('AED'),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
  rememberDevice: z.boolean().default(true),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  email,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: password,
});

export const updateMeSchema = z.object({
  baseCurrency: currencyCode.optional(),
  timeZone: z.string().min(1).optional(),
});

export type SignUpInput = z.input<typeof signUpSchema>;
export type SignInInput = z.input<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
