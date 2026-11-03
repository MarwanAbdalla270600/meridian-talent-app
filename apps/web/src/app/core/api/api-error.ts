import { HttpErrorResponse } from '@angular/common/http';
import type { ApiError } from '@meridian/shared';

/** Normalises any HTTP failure into the uniform API error shape. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as Partial<ApiError> | null;
    if (body && typeof body === 'object' && typeof body.code === 'string') {
      return {
        code: body.code,
        message: body.message ?? '',
        details: body.details,
        requestId: body.requestId ?? '',
      };
    }
    if (err.status === 0) return { code: 'NETWORK', message: err.message, requestId: '' };
    return {
      code: err.status >= 500 ? 'INTERNAL' : 'BAD_REQUEST',
      message: err.message,
      requestId: '',
    };
  }
  return { code: 'INTERNAL', message: String(err), requestId: '' };
}
