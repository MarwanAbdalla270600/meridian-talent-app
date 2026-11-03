import { z } from 'zod';
import { LOCALES, ROLES } from '../enums';
import { ACTIONS } from '../policy';

export const PASSWORD_MIN_LENGTH = 12;
export const PasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(256);

export const LoginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const MeSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(ROLES),
  locale: z.enum(LOCALES),
  totpEnabled: z.boolean(),
  mustEnrollTotp: z.boolean(),
  permissions: z.array(z.enum(ACTIONS)),
  features: z.object({ cvAiImport: z.boolean() }),
});
export type Me = z.infer<typeof MeSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: PasswordSchema,
});

export const ForgotPasswordSchema = z.object({ email: z.email().max(254) });

export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: PasswordSchema,
});

export const TotpSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
});

export const TotpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export const UpdateProfileSchema = z.object({ locale: z.enum(LOCALES) });
