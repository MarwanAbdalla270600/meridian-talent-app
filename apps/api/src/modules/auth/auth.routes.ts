import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  ChangePasswordSchema,
  ForgotPasswordSchema,
  LoginSchema,
  MeSchema,
  OkSchema,
  ResetPasswordSchema,
  TotpCodeSchema,
  TotpSetupResponseSchema,
  UpdateProfileSchema,
} from '@meridian/shared';
import { z } from 'zod';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema';
import { errors, json } from '../../lib/http';
import { RATE_LIMITS } from '../../lib/rate-limit';
import { issueCsrfToken } from '../../middleware/csrf';
import { actorOf, currentUser, requireAuth, sessionCookieName } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rate-limit';
import { validationHook } from '../../middleware/error-handler';
import type { AppEnv, Deps } from '../../types';
import * as auth from './auth.service';
import { writeAudit } from '../audit/audit.service';

const tags = ['auth'];

export function authRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  const cookieName = sessionCookieName(deps.env.COOKIE_SECURE);

  app.openapi(
    createRoute({
      method: 'get',
      path: '/csrf',
      tags,
      summary: 'Issue a CSRF token (cookie + body)',
      responses: { 200: json(z.object({ token: z.string() })) },
    }),
    (c) => c.json({ token: issueCsrfToken(c, deps) }, 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/login',
      tags,
      summary: 'Log in (creates a new session, rotates any existing one)',
      middleware: [rateLimit(deps, 'login', RATE_LIMITS.login)] as const,
      request: {
        body: { content: { 'application/json': { schema: LoginSchema } }, required: true },
      },
      responses: { 200: json(MeSchema), 400: errors[400], 401: errors[401], 429: errors[429] },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const res = await auth.login(deps, body, {
        ip: c.var.ip,
        userAgent: c.req.header('user-agent') ?? null,
        previousToken: getCookie(c, cookieName),
      });
      setCookie(c, cookieName, res.token, {
        path: '/',
        httpOnly: true,
        secure: deps.env.COOKIE_SECURE,
        sameSite: 'Lax',
        maxAge: deps.env.SESSION_TTL_HOURS * 3600,
      });
      issueCsrfToken(c, deps); // fresh CSRF token bound to the new login
      c.set('user', res.user);
      return c.json(auth.toMe(deps, res.user, res.session), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/logout',
      tags,
      middleware: [requireAuth] as const,
      responses: { 200: json(OkSchema), 401: errors[401] },
    }),
    async (c) => {
      await auth.logout(deps, c.var.session!.id, actorOf(c));
      deleteCookie(c, cookieName, { path: '/', secure: deps.env.COOKIE_SECURE });
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/logout-all',
      tags,
      summary: 'Terminate all sessions of the current user',
      middleware: [requireAuth] as const,
      responses: { 200: json(OkSchema), 401: errors[401] },
    }),
    async (c) => {
      const actor = actorOf(c);
      await auth.logoutAll(deps, actor.id, actor);
      deleteCookie(c, cookieName, { path: '/', secure: deps.env.COOKIE_SECURE });
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me',
      tags,
      middleware: [requireAuth] as const,
      responses: { 200: json(MeSchema), 401: errors[401] },
    }),
    (c) => c.json(auth.toMe(deps, currentUser(c), c.var.session!), 200),
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/me',
      tags,
      summary: 'Update own preferences (UI language)',
      middleware: [requireAuth] as const,
      request: {
        body: { content: { 'application/json': { schema: UpdateProfileSchema } }, required: true },
      },
      responses: { 200: json(MeSchema), 400: errors[400], 401: errors[401] },
    }),
    async (c) => {
      const { locale } = c.req.valid('json');
      const user = currentUser(c);
      await deps.db.update(users).set({ locale }).where(eq(users.id, user.id));
      return c.json(auth.toMe(deps, { ...user, locale }, c.var.session!), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/password',
      tags,
      summary: 'Change own password (other sessions are terminated)',
      middleware: [requireAuth] as const,
      request: {
        body: { content: { 'application/json': { schema: ChangePasswordSchema } }, required: true },
      },
      responses: { 200: json(OkSchema), 400: errors[400], 401: errors[401] },
    }),
    async (c) => {
      const b = c.req.valid('json');
      await auth.changePassword(
        deps,
        actorOf(c),
        b.currentPassword,
        b.newPassword,
        c.var.session!.id,
      );
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/password/forgot',
      tags,
      summary: 'Request a reset link (always returns ok)',
      middleware: [rateLimit(deps, 'pwreset', RATE_LIMITS.passwordReset)] as const,
      request: {
        body: { content: { 'application/json': { schema: ForgotPasswordSchema } }, required: true },
      },
      responses: { 200: json(OkSchema), 429: errors[429] },
    }),
    async (c) => {
      try {
        await auth.requestPasswordReset(deps, c.req.valid('json').email);
      } catch (err) {
        c.var.logger.error('password reset mail failed', { error: err });
      }
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/password/reset',
      tags,
      summary: 'Set a new password with a one-time link token',
      middleware: [rateLimit(deps, 'pwreset', RATE_LIMITS.passwordReset)] as const,
      request: {
        body: { content: { 'application/json': { schema: ResetPasswordSchema } }, required: true },
      },
      responses: { 200: json(OkSchema), 400: errors[400], 429: errors[429] },
    }),
    async (c) => {
      const b = c.req.valid('json');
      await auth.resetPassword(deps, b.token, b.newPassword, c.var.ip);
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/totp/setup',
      tags,
      summary: 'Start TOTP enrollment (returns secret and otpauth URL)',
      middleware: [requireAuth] as const,
      responses: { 200: json(TotpSetupResponseSchema), 401: errors[401], 409: errors[409] },
    }),
    async (c) => c.json(await auth.totpSetup(deps, actorOf(c)), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/totp/enable',
      tags,
      middleware: [requireAuth] as const,
      request: {
        body: { content: { 'application/json': { schema: TotpCodeSchema } }, required: true },
      },
      responses: { 200: json(MeSchema), 400: errors[400], 401: errors[401] },
    }),
    async (c) => {
      await auth.totpEnable(deps, actorOf(c), c.req.valid('json').code);
      const user = { ...currentUser(c), totpEnabled: true };
      return c.json(auth.toMe(deps, user, { ...c.var.session!, mustEnrollTotp: false }), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/totp/disable',
      tags,
      middleware: [requireAuth] as const,
      request: {
        body: { content: { 'application/json': { schema: TotpCodeSchema } }, required: true },
      },
      responses: { 200: json(OkSchema), 400: errors[400], 401: errors[401], 403: errors[403] },
    }),
    async (c) => {
      await auth.totpDisable(deps, actorOf(c), c.req.valid('json').code);
      return c.json({ ok: true as const }, 200);
    },
  );

  return app;
}

export { writeAudit };
