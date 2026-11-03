import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDb } from './db/client';
import { createLogger } from './lib/logger';
import { createSmtpMailer } from './lib/mail';
import { createPdfRenderer } from './lib/pdf-renderer';
import { createMemoryRateLimiter } from './lib/rate-limit';
import { createS3Storage } from './lib/storage';
import { createClamAvScanner, noopScanner } from './lib/virus-scan';
import { createAnthropicExtractor } from './modules/imports/anthropic-extractor';
import { startRetentionScheduler } from './modules/gdpr/retention.job';
import type { Deps } from './types';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, { service: 'api' });
const { db, sql } = createDb(env.DATABASE_URL, env.DATABASE_POOL_MAX);
const storage = createS3Storage(env);

if (env.S3_AUTO_CREATE_BUCKET) {
  await storage.ensureBucket().catch((err) => logger.warn('bucket check failed', { error: err }));
}

const deps: Deps = {
  env,
  db,
  logger,
  storage,
  mailer: createSmtpMailer(env, logger),
  pdf: createPdfRenderer({
    concurrency: env.PDF_CONCURRENCY,
    timeoutMs: env.PDF_TIMEOUT_MS,
    queueMax: env.PDF_QUEUE_MAX,
    logger,
  }),
  extractor:
    env.FEATURE_CV_AI_IMPORT && env.ANTHROPIC_API_KEY
      ? createAnthropicExtractor(env, logger)
      : null,
  scanner: env.CLAMAV_HOST ? createClamAvScanner(env.CLAMAV_HOST, env.CLAMAV_PORT) : noopScanner,
  limiter: createMemoryRateLimiter(),
  now: () => new Date(),
};

if (!env.CLAMAV_HOST) logger.warn('virus scanning disabled (CLAMAV_HOST not set)');

const app = createApp(deps);
const stopRetention = env.RETENTION_JOB_ENABLED ? startRetentionScheduler(deps) : () => {};

const server = Bun.serve({
  port: env.PORT,
  hostname: '0.0.0.0',
  fetch: app.fetch,
  maxRequestBodySize: (env.MAX_UPLOAD_MB + 1) * 1024 * 1024,
  idleTimeout: 120,
});
logger.info('api started', { port: server.port, env: env.NODE_ENV });

async function shutdown(signal: string) {
  logger.info('shutting down', { signal });
  stopRetention();
  await server.stop();
  await deps.pdf.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
