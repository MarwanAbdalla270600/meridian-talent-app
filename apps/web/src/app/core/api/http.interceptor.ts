import type { HttpInterceptorFn } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';

/** Sends cookies, and redirects to the login page when the session has expired. */
export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  return next(req.clone({ withCredentials: true })).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !req.url.includes('/auth/')) {
        auth.clearLocal();
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url, expired: 1 } });
      }
      if (err instanceof HttpErrorResponse && err.error?.code === 'TOTP_ENROLLMENT_REQUIRED') {
        void router.navigate(['/account'], { queryParams: { enroll: 1 } });
      }
      return throwError(() => err);
    }),
  );
};
