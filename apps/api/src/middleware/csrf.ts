import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie } from 'hono/cookie';
import { AppError } from '../lib/errors';
import { hmac, randomToken, safeEqual } from '../lib/crypto';
import type { AppEnv, Deps } from '../types';
import type { Context } from 'hono';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-csrf-token';
export const csrfCookieName = (secure: boolean) => (secure ? '__Host-mt_csrf' : 'mt_csrf');

/** Signed double-submit token: `<random>.<hmac>` – cannot be forged via cookie injection. */
export function issueCsrfToken(c: Context<AppEnv>, deps: Deps): string {
  const rand = randomToken(24);
  const token = `${rand}.${hmac(deps.env.SESSION_SECRET, `csrf:${rand}`)}`;
  setCookie(c, csrfCookieName(deps.env.COOKIE_SECURE), token, {
    path: '/',
    secure: deps.env.COOKIE_SECURE,
    sameSite: 'Strict',
    httpOnly: false, // must be readable by the SPA to echo it in the header
    maxAge: 60 * 60 * 24,
  });
  return token;
}

function validToken(token: string, secret: string): boolean {
  const [rand, mac] = token.split('.');
  return !!rand && !!mac && safeEqual(mac, hmac(secret, `csrf:${rand}`));
}

/**
 * CSRF protection for all state-changing requests:
 *  1. Origin (or Referer) must equal BASE_URL; cross-site Sec-Fetch-Site is rejected.
 *  2. Header token must equal the cookie token and carry a valid signature.
 */
export const csrfProtection = (deps: Deps) => {
  const allowed = new URL(deps.env.BASE_URL).origin;
  return createMiddleware<AppEnv>(async (c, next) => {
    if (SAFE.has(c.req.method)) return next();

    const site = c.req.header('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none')
      throw new AppError(403, 'CSRF_FAILED', 'Cross-site request rejected');

    const origin =
      c.req.header('origin') ??
      (c.req.header('referer') ? new URL(c.req.header('referer')!).origin : null);
    if (!origin || origin !== allowed) throw new AppError(403, 'CSRF_FAILED', 'Origin not allowed');

    const header = c.req.header(CSRF_HEADER);
    const cookie = getCookie(c, csrfCookieName(deps.env.COOKIE_SECURE));
    if (
      !header ||
      !cookie ||
      !safeEqual(header, cookie) ||
      !validToken(header, deps.env.SESSION_SECRET)
    ) {
      throw new AppError(403, 'CSRF_FAILED', 'Missing or invalid CSRF token');
    }
    await next();
  });
};
