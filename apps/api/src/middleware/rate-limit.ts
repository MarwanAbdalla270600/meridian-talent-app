import { createMiddleware } from 'hono/factory';
import { AppError } from '../lib/errors';
import type { RateLimitRule } from '../lib/rate-limit';
import type { AppEnv, Deps } from '../types';

/** Rate limit keyed by user (if authenticated) or client IP. */
export const rateLimit = (
  deps: Deps,
  name: string,
  rule: RateLimitRule,
  by: 'ip' | 'user' = 'ip',
) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const who = by === 'user' && c.var.user ? `u:${c.var.user.id}` : `ip:${c.var.ip ?? 'unknown'}`;
    const r = deps.limiter.hit(`${name}:${who}`, rule);
    if (!r.ok) {
      c.header('Retry-After', String(r.retryAfter));
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests', { retryAfter: r.retryAfter });
    }
    await next();
  });
