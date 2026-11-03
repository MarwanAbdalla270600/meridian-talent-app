import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import type { Action } from '@meridian/shared';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const me = await auth.load();
  if (!me) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (me.mustEnrollTotp && !state.url.startsWith('/account')) {
    return router.createUrlTree(['/account'], { queryParams: { enroll: 1 } });
  }
  return true;
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const me = await auth.load();
  return me ? inject(Router).createUrlTree(['/developers']) : true;
};

export const permissionGuard =
  (action: Action): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    return auth.can(action) ? true : inject(Router).createUrlTree(['/developers']);
  };
