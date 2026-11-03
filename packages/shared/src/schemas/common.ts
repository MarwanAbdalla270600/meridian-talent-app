import { z } from 'zod';

export const IdSchema = z.uuid();
export const IdParamSchema = z.object({ id: z.uuid() });

/** Calendar date, `YYYY-MM-DD`. */
export const IsoDateSchema = z.iso.date();
/** Month, `YYYY-MM` (used for experience periods). */
export const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

/** Trimmed text with max length; empty strings become `null`. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const requiredText = (max: number) => z.string().trim().min(1).max(max);

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Uniform API error format. */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const OkSchema = z.object({ ok: z.literal(true) });

/** Stable machine-readable error codes (translated in the frontend under `errors.<CODE>`). */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VERSION_CONFLICT',
  'INVALID_TRANSITION',
  'CHECKLIST_INCOMPLETE',
  'NOTE_REQUIRED',
  'NOT_CLIENT_READY',
  'PROCESSING_RESTRICTED',
  'RATE_LIMITED',
  'CSRF_FAILED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'TOTP_REQUIRED',
  'TOTP_INVALID',
  'TOTP_ENROLLMENT_REQUIRED',
  'WEAK_PASSWORD',
  'TOKEN_INVALID',
  'FILE_TOO_LARGE',
  'FILE_TYPE_NOT_ALLOWED',
  'FILE_INFECTED',
  'IMPORT_DISABLED',
  'IMPORT_UNREADABLE',
  'IMPORT_TIMEOUT',
  'IMPORT_FAILED',
  'IMPORT_REVIEW_INCOMPLETE',
  'PDF_BUSY',
  'PDF_TIMEOUT',
  'PDF_FAILED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
