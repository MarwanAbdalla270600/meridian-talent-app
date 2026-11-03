import type { HttpInterceptorFn } from '@angular/common/http';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
// `__Host-` prefixed in production (Secure cookies), plain name in local http development.
const COOKIE_NAMES = ['__Host-mt_csrf', 'mt_csrf'];

function readCsrfCookie(): string | null {
  const cookies = document.cookie.split(';').map((c) => c.trim());
  for (const name of COOKIE_NAMES) {
    const hit = cookies.find((c) => c.startsWith(`${name}=`));
    if (hit) return decodeURIComponent(hit.slice(name.length + 1));
  }
  return null;
}

/** Echoes the signed CSRF cookie in the X-CSRF-Token header for same-origin API writes. */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  if (SAFE.has(req.method) || !req.url.startsWith('/api/')) return next(req);
  const token = readCsrfCookie();
  return next(token ? req.clone({ setHeaders: { 'X-CSRF-Token': token } }) : req);
};
