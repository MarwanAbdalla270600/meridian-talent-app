import { z } from 'zod';
import { LOCALES, ROLES } from '../enums';

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(ROLES),
  locale: z.enum(LOCALES),
  isActive: z.boolean(),
  totpEnabled: z.boolean(),
  lastLoginAt: z.string().nullable(),
  lockedUntil: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const UserCreateSchema = z
  .object({
    email: z.email().max(254),
    displayName: z.string().trim().min(1).max(120),
    role: z.enum(ROLES),
    locale: z.enum(LOCALES).default('de'),
  })
  .strict();

export const UserUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    role: z.enum(ROLES).optional(),
    locale: z.enum(LOCALES).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
