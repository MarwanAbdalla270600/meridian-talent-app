import { ApiErrorSchema } from '@meridian/shared';
import type { z } from 'zod';
import type { Context } from 'hono';
import type { AppEnv } from '../types';

export const json = <T extends z.ZodType>(schema: T, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});

const err = (description: string) => json(ApiErrorSchema, description);

/** Standard error responses documented on every protected route. */
export const errors = {
  400: err('Bad request / validation failed'),
  401: err('Not authenticated'),
  403: err('Forbidden'),
  404: err('Not found'),
  409: err('Conflict'),
  429: err('Rate limited'),
} as const;

export const authErrors = { 401: errors[401], 403: errors[403], 429: errors[429] } as const;

export const cookieSecurity = { session: 'session', csrf: 'csrf' } as const;

export function clientIp(
  c: Context<AppEnv>,
  trustProxy: boolean,
  connIp: string | null,
): string | null {
  if (trustProxy) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) {
      const parts = xff
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return last;
    }
  }
  return connIp;
}

/** Converts DB values (Date) to ISO strings for DTOs. */
export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
export const isoReq = (d: Date): string => d.toISOString();
