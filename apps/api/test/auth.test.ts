import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as OTPAuth from 'otpauth';
import { auditLog, sessions, users } from '../src/db/schema';
import { saveSettings } from '../src/modules/settings/settings.service';
import { createTestContext, EMAILS, PASSWORDS, type TestContext } from './helpers';

let ctx: TestContext;
beforeEach(async () => {
  ctx = await createTestContext();
});

describe('health & error format', () => {
  test('health endpoint checks the database', async () => {
    const r = await ctx.client().get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', db: true });
  });

  test('errors use the uniform format with requestId', async () => {
    const r = await ctx.client().get('/api/auth/me');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: expect.any(String),
      requestId: expect.any(String),
    });
    expect(r.headers.get('x-request-id')).toBe(r.body.requestId);
  });

  test('security headers are set', async () => {
    const r = await ctx.client().get('/api/health');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('strict-transport-security')).toContain('max-age=');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  test('OpenAPI document is generated', async () => {
    const r = await ctx.client().get('/api/openapi.json');
    expect(r.status).toBe(200);
    expect(r.body.paths['/api/auth/login']).toBeDefined();
  });
});

describe('login', () => {
  test('successful login sets HttpOnly session cookie and returns permissions', async () => {
    const c = ctx.client();
    await c.get('/api/auth/csrf');
    const res = await ctx.app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: c.origin,
        cookie: `mt_csrf=${c.cookies.get('mt_csrf')}`,
        'x-csrf-token': c.cookies.get('mt_csrf')!,
      },
      body: JSON.stringify({ email: EMAILS.egypt_editor, password: PASSWORDS.egypt_editor }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((s) => s.startsWith('mt_session='))!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const me = (await res.json()) as any;
    expect(me.role).toBe('egypt_editor');
    expect(me.permissions).toContain('developer:create');
    expect(me.permissions).not.toContain('client:read');
  });

  test('email is case-insensitive', async () => {
    const r = await ctx.client().login(EMAILS.admin.toUpperCase(), PASSWORDS.admin);
    expect(r.status).toBe(200);
  });

  test('wrong password and unknown user give the same error', async () => {
    const a = await ctx.client().login(EMAILS.admin, 'wrong-password-123');
    const b = await ctx.client().login('nobody@test.local', 'wrong-password-123');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.code).toBe('INVALID_CREDENTIALS');
    expect(b.body.code).toBe('INVALID_CREDENTIALS');
  });

  test('account is locked after repeated failures', async () => {
    const c = ctx.client();
    for (let i = 0; i < ctx.deps.env.LOGIN_MAX_FAILED; i++)
      await c.login(EMAILS.admin, 'wrong-password-123');
    const r = await c.login(EMAILS.admin, PASSWORDS.admin);
    expect(r.status).toBe(423);
    expect(r.body.code).toBe('ACCOUNT_LOCKED');
    const audit = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'auth.locked'));
    expect(audit).toHaveLength(1);
    // lock expires
    ctx.clock.now = new Date(Date.now() + (ctx.deps.env.LOGIN_LOCK_MINUTES + 1) * 60_000);
    expect((await c.login(EMAILS.admin, PASSWORDS.admin)).status).toBe(200);
  });

  test('deactivated users cannot log in', async () => {
    await ctx.db.update(users).set({ isActive: false }).where(eq(users.id, ctx.userIds.admin));
    expect((await ctx.client().login(EMAILS.admin, PASSWORDS.admin)).status).toBe(401);
  });

  test('login is rate limited per IP', async () => {
    const c = ctx.client();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await c.login('x@test.local', 'nope-nope-nope')).status;
    expect(last).toBe(429);
  });

  test('session rotation: re-login invalidates the previous session token', async () => {
    const c = await ctx.login('admin');
    const old = c.cookies.get('mt_session')!;
    await c.login(EMAILS.admin, PASSWORDS.admin);
    expect(c.cookies.get('mt_session')).not.toBe(old);
    const rows = await ctx.db.select().from(sessions).where(eq(sessions.userId, ctx.userIds.admin));
    expect(rows).toHaveLength(1);
  });
});

describe('sessions', () => {
  test('me returns the current user; logout ends the session', async () => {
    const c = await ctx.login('austria_reviewer');
    expect((await c.get('/api/auth/me')).body.role).toBe('austria_reviewer');
    const token = c.cookies.get('mt_session')!;
    expect((await c.post('/api/auth/logout')).status).toBe(200);
    c.cookies.set('mt_session', token); // replaying the old cookie must not work
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  test('logout-all terminates every session of the user', async () => {
    const a = await ctx.login('admin');
    const b = await ctx.login('admin');
    await a.post('/api/auth/logout-all');
    expect((await b.get('/api/auth/me')).status).toBe(401);
  });

  test('idle sessions expire', async () => {
    const c = await ctx.login('admin');
    ctx.clock.now = new Date(Date.now() + (ctx.deps.env.SESSION_IDLE_MINUTES + 1) * 60_000);
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  test('sessions expire absolutely after the TTL', async () => {
    const c = await ctx.login('admin');
    ctx.clock.now = new Date(Date.now() + (ctx.deps.env.SESSION_TTL_HOURS + 1) * 3_600_000);
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  test('only the token hash is stored', async () => {
    const c = await ctx.login('admin');
    const [row] = await ctx.db.select().from(sessions);
    expect(row!.tokenHash).not.toBe(c.cookies.get('mt_session'));
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('CSRF', () => {
  test('state-changing request without token is rejected', async () => {
    const c = await ctx.login('admin');
    const r = await c.request('POST', '/api/auth/logout', undefined, { csrf: false });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CSRF_FAILED');
  });

  test('foreign origin is rejected', async () => {
    const c = await ctx.login('admin');
    c.origin = 'https://evil.example';
    const r = await c.post('/api/auth/logout');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CSRF_FAILED');
  });

  test('forged (unsigned) token is rejected even if cookie and header match', async () => {
    const c = await ctx.login('admin');
    c.cookies.set('mt_csrf', 'forged.token');
    expect((await c.post('/api/auth/logout')).status).toBe(403);
  });

  test('cross-site fetch metadata is rejected', async () => {
    const c = await ctx.login('admin');
    const r = await c.request('POST', '/api/auth/logout', undefined, {
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(r.status).toBe(403);
  });
});

describe('passwords', () => {
  test('forgot password does not reveal whether an account exists', async () => {
    const c = ctx.client();
    await c.get('/api/auth/csrf');
    expect((await c.post('/api/auth/password/forgot', { email: 'nobody@test.local' })).status).toBe(
      200,
    );
    expect(ctx.mailer.sent).toHaveLength(0);
    expect((await c.post('/api/auth/password/forgot', { email: EMAILS.egypt_editor })).status).toBe(
      200,
    );
    expect(ctx.mailer.sent).toHaveLength(1);
  });

  test('reset link works once, rejects weak passwords and ends sessions', async () => {
    const existing = await ctx.login('egypt_editor');
    const c = ctx.client();
    await c.get('/api/auth/csrf');
    await c.post('/api/auth/password/forgot', { email: EMAILS.egypt_editor });
    const token = /token=([^\s]+)/.exec(ctx.mailer.sent[0]!.text)![1]!;
    const decoded = decodeURIComponent(token);

    const weak = await c.post('/api/auth/password/reset', {
      token: decoded,
      newPassword: 'password1234',
    });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('WEAK_PASSWORD');

    const ok = await c.post('/api/auth/password/reset', {
      token: decoded,
      newPassword: 'Völlig-neues-Passwort-42',
    });
    expect(ok.status).toBe(200);
    expect((await existing.get('/api/auth/me')).status).toBe(401);
    expect(
      (
        await c.post('/api/auth/password/reset', {
          token: decoded,
          newPassword: 'Noch-ein-Passwort-43',
        })
      ).body.code,
    ).toBe('TOKEN_INVALID');
    expect((await ctx.client().login(EMAILS.egypt_editor, 'Völlig-neues-Passwort-42')).status).toBe(
      200,
    );
  });

  test('expired reset link is rejected', async () => {
    const c = ctx.client();
    await c.get('/api/auth/csrf');
    await c.post('/api/auth/password/forgot', { email: EMAILS.admin });
    const token = decodeURIComponent(/token=([^\s]+)/.exec(ctx.mailer.sent[0]!.text)![1]!);
    ctx.clock.now = new Date(Date.now() + 2 * 3_600_000);
    expect(
      (await c.post('/api/auth/password/reset', { token, newPassword: 'Völlig-neues-Passwort-42' }))
        .body.code,
    ).toBe('TOKEN_INVALID');
  });

  test('change password requires the current password', async () => {
    const c = await ctx.login('admin');
    expect(
      (
        await c.post('/api/auth/password', {
          currentPassword: 'wrong',
          newPassword: 'Ein-starkes-Passwort-99',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await c.post('/api/auth/password', {
          currentPassword: PASSWORDS.admin,
          newPassword: 'Ein-starkes-Passwort-99',
        })
      ).status,
    ).toBe(200);
    expect((await c.get('/api/auth/me')).status).toBe(200); // current session survives
  });

  test('passwords are hashed with argon2id', async () => {
    const [u] = await ctx.db.select().from(users).where(eq(users.id, ctx.userIds.admin));
    expect(u!.passwordHash).toStartWith('$argon2id$');
  });
});

describe('TOTP 2FA', () => {
  const codeFor = (secret: string) =>
    new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secret),
      digits: 6,
      period: 30,
    }).generate();

  test('enroll, then login requires the code', async () => {
    const c = await ctx.login('admin');
    const setup = await c.post('/api/auth/totp/setup');
    expect(setup.body.otpauthUrl).toStartWith('otpauth://totp/');
    expect((await c.post('/api/auth/totp/enable', { code: '000000' })).body.code).toBe(
      'TOTP_INVALID',
    );
    expect(
      (await c.post('/api/auth/totp/enable', { code: codeFor(setup.body.secret) })).status,
    ).toBe(200);

    const [u] = await ctx.db.select().from(users).where(eq(users.id, ctx.userIds.admin));
    expect(u!.totpSecret).toStartWith('v1.'); // encrypted at rest
    expect(u!.totpSecret).not.toContain(setup.body.secret);

    const n = ctx.client();
    expect((await n.login(EMAILS.admin, PASSWORDS.admin)).body.code).toBe('TOTP_REQUIRED');
    expect((await n.login(EMAILS.admin, PASSWORDS.admin, '123456')).body.code).toBe('TOTP_INVALID');
    expect((await n.login(EMAILS.admin, PASSWORDS.admin, codeFor(setup.body.secret))).status).toBe(
      200,
    );
  });

  test('mandatory 2FA for privileged roles restricts the session until enrolled', async () => {
    await saveSettings(ctx.db, { requireTotpForPrivileged: true });
    const c = await ctx.login('austria_reviewer');
    expect((await c.get('/api/auth/me')).body.mustEnrollTotp).toBe(true);
    const blocked = await c.get('/api/developers');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('TOTP_ENROLLMENT_REQUIRED');
    const setup = await c.post('/api/auth/totp/setup');
    await c.post('/api/auth/totp/enable', { code: codeFor(setup.body.secret) });
    expect((await c.get('/api/developers')).status).toBe(200);
    // egypt is not affected
    const e = await ctx.login('egypt_editor');
    expect((await e.get('/api/auth/me')).body.mustEnrollTotp).toBe(false);
  });
});
