import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import type { AppEnv } from '../types';

const PG_UNIQUE = '23505';
const PG_FK = '23503';
const PG_CHECK = '23514';

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId') ?? 'unknown';
  if (err instanceof AppError) {
    return c.json(
      {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
        requestId,
      },
      err.status,
    );
  }
  if (err instanceof ZodError) {
    return c.json(
      { code: 'VALIDATION_FAILED', message: 'Validation failed', details: err.issues, requestId },
      400,
    );
  }
  if (err instanceof HTTPException) {
    const status = err.status;
    const code =
      status === 413 ? 'FILE_TOO_LARGE' : status === 401 ? 'UNAUTHENTICATED' : 'BAD_REQUEST';
    return c.json({ code, message: err.message || 'Request rejected', requestId }, status);
  }
  const pg = pgCode(err);
  if (pg === PG_UNIQUE)
    return c.json({ code: 'CONFLICT', message: 'Already exists', requestId }, 409);
  if (pg === PG_FK)
    return c.json(
      { code: 'CONFLICT', message: 'Referenced record missing or still in use', requestId },
      409,
    );
  if (pg === PG_CHECK)
    return c.json({ code: 'VALIDATION_FAILED', message: 'Constraint violated', requestId }, 400);

  c.get('logger')?.error('unhandled error', { error: err });
  return c.json({ code: 'INTERNAL', message: 'Internal server error', requestId }, 500);
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  c.json(
    { code: 'NOT_FOUND', message: 'Route not found', requestId: c.get('requestId') ?? 'unknown' },
    404,
  );

/** Validation hook for @hono/zod-openapi: uniform error format. */
export const validationHook = (
  result: { success: true } | { success: false; error: ZodError },
  c: { get: (k: 'requestId') => string; json: (b: unknown, s: 400) => Response },
) => {
  if (!result.success) {
    return c.json(
      {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details: result.error.issues.map((i) => ({
          path: i.path,
          code: i.code,
          message: i.message,
        })),
        requestId: c.get('requestId'),
      },
      400,
    );
  }
  return undefined;
};
