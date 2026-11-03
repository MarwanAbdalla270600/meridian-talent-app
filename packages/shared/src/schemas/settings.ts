import { z } from 'zod';

/** Runtime settings editable by admins (stored in the `settings` table). */
export const SettingsSchema = z
  .object({
    /** If true, editing critical fields of an approved profile moves it back to Pool 1. */
    resetApprovalOnCriticalChange: z.boolean(),
    /** Months after the last update before a profile is flagged for deletion. */
    retentionMonths: z.number().int().min(1).max(120),
    /** Days a profile may exist without candidate consent before it is flagged. */
    consentGraceDays: z.number().int().min(1).max(365),
    /** Current version of the consent text candidates sign. */
    currentConsentVersion: z.string().trim().min(1).max(40),
    /** Require TOTP 2FA for austria_reviewer and admin. */
    requireTotpForPrivileged: z.boolean(),
  })
  .strict();
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsUpdateSchema = SettingsSchema.partial().strict();

/** Fields whose change resets an approval when `resetApprovalOnCriticalChange` is on. */
export const CRITICAL_FIELDS = [
  'firstName',
  'lastName',
  'title',
  'seniority',
  'summaryDe',
  'summaryEn',
  'skills',
  'experiences',
] as const;
