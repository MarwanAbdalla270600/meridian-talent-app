import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no'])
    .optional()
    .transform((v) => (v === undefined ? def : ['true', '1', 'yes'].includes(v)));

const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max).default(def);

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: int(3000, 1, 65535),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    /** Public origin of the application, e.g. https://talent.meridian.example */
    BASE_URL: z.url(),
    /** Trust X-Forwarded-For from the reverse proxy (Caddy). */
    TRUST_PROXY: bool(false),

    DATABASE_URL: z.url(),
    DATABASE_POOL_MAX: int(10, 1, 100),

    /** HMAC key for CSRF tokens and token hashing; at least 32 characters. */
    SESSION_SECRET: z.string().min(32),
    /** Base64-encoded 32-byte key for AES-256-GCM encryption of TOTP secrets. */
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64'),
    COOKIE_SECURE: bool(true),
    SESSION_TTL_HOURS: int(12, 1, 24 * 30),
    SESSION_IDLE_MINUTES: int(120, 5, 24 * 60),
    LOGIN_MAX_FAILED: int(5, 1, 50),
    LOGIN_LOCK_MINUTES: int(15, 1, 24 * 60),

    S3_ENDPOINT: optional,
    /** Endpoint used in pre-signed URLs (reachable by the browser); defaults to S3_ENDPOINT. */
    S3_PUBLIC_ENDPOINT: optional,
    S3_REGION: z.string().default('eu-central-1'),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: bool(true),
    S3_AUTO_CREATE_BUCKET: bool(false),
    S3_PRESIGN_SECONDS: int(60, 10, 3600),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: int(587, 1, 65535),
    SMTP_SECURE: bool(false),
    SMTP_USER: optional,
    SMTP_PASSWORD: optional,
    MAIL_FROM: z.string().min(3),

    FEATURE_CV_AI_IMPORT: bool(false),
    ANTHROPIC_API_KEY: optional,
    ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
    /** Server-side refusal fallbacks (Claude API only; disable for gateways that reject the beta). */
    ANTHROPIC_FALLBACKS: bool(true),
    /** Optional inference geography passed through to the API (see docs/dsgvo.md). */
    ANTHROPIC_INFERENCE_GEO: optional,
    ANTHROPIC_BASE_URL: optional,
    CV_IMPORT_TIMEOUT_MS: int(90_000, 5_000, 600_000),

    MAX_UPLOAD_MB: int(10, 1, 100),
    CLAMAV_HOST: optional,
    CLAMAV_PORT: int(3310, 1, 65535),

    PDF_CONCURRENCY: int(2, 1, 16),
    PDF_TIMEOUT_MS: int(30_000, 1_000, 300_000),
    PDF_QUEUE_MAX: int(20, 1, 1000),

    RETENTION_JOB_ENABLED: bool(true),
    /** Defaults written to the settings table on first start. */
    RETENTION_MONTHS: int(24, 1, 120),
    CONSENT_GRACE_DAYS: int(30, 1, 365),
    REQUIRE_TOTP_FOR_PRIVILEGED: bool(false),

    API_DOCS_ENABLED: bool(false),
  })
  .superRefine((e, ctx) => {
    if (e.FEATURE_CV_AI_IMPORT && !e.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'required when FEATURE_CV_AI_IMPORT=true',
      });
    }
    if (e.NODE_ENV === 'production') {
      if (!e.COOKIE_SECURE)
        ctx.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'must be true in production',
        });
      if (!e.BASE_URL.startsWith('https://'))
        ctx.addIssue({
          code: 'custom',
          path: ['BASE_URL'],
          message: 'must use https in production',
        });
      if (/change-me|example|dev-only/i.test(e.SESSION_SECRET))
        ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'placeholder secret' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Parses the environment and aborts the process with a readable message on error (fail fast). */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // Only variable names and messages are printed, never values.
    console.error(`Invalid configuration:\n${lines.join('\n')}`);
    process.exit(1);
  }
  return parsed.data;
}

export { EnvSchema };
