import type { ErrorCode } from '@meridian/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Domain error mapped to the uniform API error format by the error handler. */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthenticated = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'Not allowed') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: ErrorCode, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
