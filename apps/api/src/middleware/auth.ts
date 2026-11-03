import { can, type Action, type DeveloperPolicyContext } from '@meridian/shared';
import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { AppError } from '../lib/errors';
import { resolveSession } from '../modules/auth/auth.service';
import type { Actor, AppEnv, AuthUser, Deps } from '../types';

export const sessionCookieName = (secure: boolean) => (secure ? '__Host-mt_session' : 'mt_session');

/** Paths a session flagged `mustEnrollTotp` may still use. */
const ENROLLMENT_ALLOWLIST = new Set([
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/csrf',
  '/api/auth/totp/setup',
  '/api/auth/totp/enable',
]);

/** Loads the session (if any) into the context. Never rejects by itself. */
export const loadSession = (deps: Deps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, sessionCookieName(deps.env.COOKIE_SECURE));
    if (token && token.length <= 128) {
      const res = await resolveSession(deps, token);
      if (res) {
        c.set('user', res.user);
        c.set('session', res.session);
      }
    }
    await next();
  });

/** Rejects unauthenticated requests and sessions that still must enroll 2FA. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user || !c.var.session)
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  if (c.var.session.mustEnrollTotp && !ENROLLMENT_ALLOWLIST.has(c.req.path)) {
    throw new AppError(403, 'TOTP_ENROLLMENT_REQUIRED', '2FA enrollment required');
  }
  await next();
});

/** Route-level permission check via the central policy. */
export const requirePermission = (action: Action) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.user;
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    if (!can(user.role, action)) throw new AppError(403, 'FORBIDDEN', 'Not allowed');
    await next();
  });

export function currentUser(c: Context<AppEnv>): AuthUser {
  const u = c.var.user;
  if (!u) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  return u;
}

export function actorOf(c: Context<AppEnv>): Actor {
  const u = currentUser(c);
  return { id: u.id, role: u.role, ip: c.var.ip };
}

/** Resource-level check; throws 403 (or a more specific code). */
export function assertCan(actor: Actor, action: Action, dev?: DeveloperPolicyContext) {
  if (can(actor.role, action, dev)) return;
  if (dev?.processingRestricted && can(actor.role, action)) {
    throw new AppError(403, 'PROCESSING_RESTRICTED', 'Processing of this profile is restricted');
  }
  if (
    action === 'pdf:generate' &&
    dev &&
    dev.status !== 'P2_FREIGEGEBEN' &&
    can(actor.role, action)
  ) {
    throw new AppError(409, 'NOT_CLIENT_READY', 'Only approved (Pool 2) profiles are client-ready');
  }
  throw new AppError(403, 'FORBIDDEN', 'Not allowed');
}
