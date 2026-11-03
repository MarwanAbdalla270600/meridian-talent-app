import type { Role } from '@meridian/shared';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createApp } from '../src/app';
import { EnvSchema, type Env } from '../src/config/env';
import { createDb } from '../src/db/client';
import { seedSkills, seedUser } from '../src/db/seed';
import { silentLogger } from '../src/lib/logger';
import { createMemoryMailer } from '../src/lib/mail';
import { createPdfRenderer, type PdfRenderer } from '../src/lib/pdf-renderer';
import { createMemoryRateLimiter } from '../src/lib/rate-limit';
import { createMemoryStorage } from '../src/lib/storage';
import { noopScanner, type VirusScanner } from '../src/lib/virus-scan';
import type { CvExtractor } from '../src/modules/imports/extractor';
import { clearSettingsCache } from '../src/modules/settings/settings.service';
import type { Deps } from '../src/types';

export const BASE_URL = 'http://localhost:4200';
export const PASSWORDS: Record<Role, string> = {
  egypt_editor: 'Egypt-Test-Passw0rd!',
  austria_reviewer: 'Austria-Test-Passw0rd!',
  admin: 'Admin-Test-Passw0rd!',
};
export const EMAILS: Record<Role, string> = {
  egypt_editor: 'egypt@test.local',
  austria_reviewer: 'austria@test.local',
  admin: 'admin@test.local',
};

const DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://meridian:meridian@localhost:5432/meridian_test';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return EnvSchema.parse({
    NODE_ENV: 'test',
    BASE_URL,
    DATABASE_URL: DB_URL,
    SESSION_SECRET: 'test-session-secret-0123456789-abcdefghij',
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    COOKIE_SECURE: 'false',
    S3_BUCKET: 'test-bucket',
    S3_ACCESS_KEY_ID: 'x',
    S3_SECRET_ACCESS_KEY: 'x',
    SMTP_HOST: 'localhost',
    MAIL_FROM: 'test@test.local',
    API_DOCS_ENABLED: 'true',
    RETENTION_JOB_ENABLED: 'false',
    ...overrides,
  });
}

const shared = createDb(DB_URL, 5);
let migrated: Promise<void> | null = null;
let sharedPdf: PdfRenderer | null = null;

export async function resetDb() {
  migrated ??= migrate(shared.db, {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  });
  await migrated;
  await shared.sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL session_replication_role = replica`);
    await tx.unsafe(`TRUNCATE users, sessions, password_reset_tokens, developers, skills, developer_skills,
      experiences, certifications, developer_languages, documents, cv_imports, clients, requests, request_skills,
      request_developers, status_history, audit_log, settings RESTART IDENTITY CASCADE`);
  });
  clearSettingsCache();
  await seedSkills(shared.db);
}

export interface TestContextOptions {
  env?: Record<string, string>;
  extractor?: CvExtractor | null;
  scanner?: VirusScanner;
  realPdf?: boolean;
}

export async function createTestContext(opts: TestContextOptions = {}) {
  await resetDb();
  const mailer = createMemoryMailer();
  const storage = createMemoryStorage();
  const clock = { now: new Date() };
  const env = testEnv(opts.env);
  if (opts.realPdf) {
    sharedPdf ??= createPdfRenderer({
      concurrency: 2,
      timeoutMs: 30_000,
      queueMax: 10,
      logger: silentLogger,
    });
  }
  const pdf: PdfRenderer = opts.realPdf
    ? sharedPdf!
    : {
        render: async (html) => new TextEncoder().encode(`%PDF-1.7 fake ${html.length}`),
        close: async () => {},
        stats: () => ({ running: 0, queued: 0 }),
      };
  const deps: Deps = {
    env,
    db: shared.db,
    logger: silentLogger,
    storage,
    mailer,
    pdf,
    extractor: opts.extractor ?? null,
    scanner: opts.scanner ?? noopScanner,
    limiter: createMemoryRateLimiter(),
    now: () => clock.now,
  };
  const app = createApp(deps);
  const userIds = {} as Record<Role, string>;
  for (const role of ['egypt_editor', 'austria_reviewer', 'admin'] as Role[]) {
    userIds[role] = await seedUser(shared.db, role, EMAILS[role], PASSWORDS[role], role);
  }
  const client = () => new TestClient(app);
  const login = async (role: Role) => {
    const c = client();
    const r = await c.login(EMAILS[role], PASSWORDS[role]);
    if (r.status !== 200)
      throw new Error(`login failed for ${role}: ${r.status} ${JSON.stringify(r.body)}`);
    return c;
  };
  return { app, deps, mailer, storage, clock, db: shared.db, userIds, client, login };
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>;

export interface TestResponse<T = any> {
  status: number;
  body: T;
  headers: Headers;
  raw: Uint8Array;
}

/** Minimal browser-like client: cookie jar, Origin header and CSRF token echo. */
export class TestClient {
  cookies = new Map<string, string>();
  origin = BASE_URL;
  constructor(private readonly app: ReturnType<typeof createApp>) {}

  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [name, ...rest] = pair!.split('=');
      const value = rest.join('=');
      const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
      if (expired || value === '') this.cookies.delete(name!.trim());
      else this.cookies.set(name!.trim(), value);
    }
  }

  async request<T = any>(
    method: string,
    path: string,
    body?: unknown,
    opts: { headers?: Record<string, string>; csrf?: boolean; form?: FormData } = {},
  ): Promise<TestResponse<T>> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (this.cookies.size)
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (method !== 'GET') {
      if (this.origin) headers.origin = this.origin;
      const csrf = this.cookies.get('mt_csrf');
      if (opts.csrf !== false && csrf) headers['x-csrf-token'] = csrf;
    }
    let payload: BodyInit | undefined;
    if (opts.form) payload = opts.form;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await this.app.request(path, { method, headers, body: payload });
    this.store(res);
    const raw = new Uint8Array(await res.arrayBuffer());
    const type = res.headers.get('content-type') ?? '';
    const parsed = type.includes('json') ? JSON.parse(new TextDecoder().decode(raw)) : undefined;
    return { status: res.status, body: parsed as T, headers: res.headers, raw };
  }

  get = <T = any>(path: string) => this.request<T>('GET', path);
  post = <T = any>(path: string, body?: unknown) => this.request<T>('POST', path, body);
  put = <T = any>(path: string, body?: unknown) => this.request<T>('PUT', path, body);
  patch = <T = any>(path: string, body?: unknown) => this.request<T>('PATCH', path, body);
  del = <T = any>(path: string) => this.request<T>('DELETE', path);

  async login(email: string, password: string, totp?: string) {
    if (!this.cookies.has('mt_csrf')) await this.get('/api/auth/csrf');
    return this.post('/api/auth/login', { email, password, ...(totp ? { totp } : {}) });
  }
}

export { sql };
