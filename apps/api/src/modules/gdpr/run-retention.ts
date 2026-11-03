/** One-off execution of the retention job (e.g. from cron: `bun run jobs:retention`). */
import { loadEnv } from '../../config/env';
import { createDb } from '../../db/client';
import { createLogger } from '../../lib/logger';
import { createMemoryRateLimiter } from '../../lib/rate-limit';
import { createS3Storage } from '../../lib/storage';
import { createSmtpMailer } from '../../lib/mail';
import { noopScanner } from '../../lib/virus-scan';
import { runRetention } from './retention.job';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, { service: 'retention' });
const { db, sql } = createDb(env.DATABASE_URL, 1);
const unavailable = () => {
  throw new Error('not available in job context');
};
const result = await runRetention({
  env,
  db,
  logger,
  storage: createS3Storage(env),
  mailer: createSmtpMailer(env, logger),
  pdf: { render: unavailable, close: async () => {}, stats: () => ({ running: 0, queued: 0 }) },
  extractor: null,
  scanner: noopScanner,
  limiter: createMemoryRateLimiter(),
  now: () => new Date(),
});
logger.info('retention job finished', { ...result });
await sql.end();
