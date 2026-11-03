import type { Role } from '@meridian/shared';
import type { Env } from './config/env';
import type { Db } from './db/client';
import type { CvExtractor } from './modules/imports/extractor';
import type { Logger } from './lib/logger';
import type { Mailer } from './lib/mail';
import type { PdfRenderer } from './lib/pdf-renderer';
import type { RateLimiter } from './lib/rate-limit';
import type { Storage } from './lib/storage';
import type { VirusScanner } from './lib/virus-scan';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  locale: 'de' | 'en';
  totpEnabled: boolean;
}

export interface SessionInfo {
  id: string;
  mustEnrollTotp: boolean;
}

/** Hono context variables. */
export interface AppEnv {
  Variables: {
    requestId: string;
    ip: string | null;
    logger: Logger;
    user: AuthUser | null;
    session: SessionInfo | null;
  };
}

/** Everything the application needs from the outside world (injected, fakeable in tests). */
export interface Deps {
  env: Env;
  db: Db;
  logger: Logger;
  storage: Storage;
  mailer: Mailer;
  pdf: PdfRenderer;
  extractor: CvExtractor | null;
  scanner: VirusScanner;
  limiter: RateLimiter;
  now: () => Date;
}

/** Audit context passed into services. */
export interface Actor {
  id: string;
  role: Role;
  ip: string | null;
}
