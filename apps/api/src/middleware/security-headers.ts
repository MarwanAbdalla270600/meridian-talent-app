import { secureHeaders } from 'hono/secure-headers';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';

const strict = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'none'"],
  },
  strictTransportSecurity: 'max-age=63072000; includeSubDomains',
  referrerPolicy: 'no-referrer',
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  crossOriginResourcePolicy: 'same-origin',
  crossOriginOpenerPolicy: 'same-origin',
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: [],
    usb: [],
  },
});

/** Swagger UI needs its assets from jsDelivr; relaxed CSP only on the docs page. */
const docs = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    scriptSrc: ['https://cdn.jsdelivr.net', "'unsafe-inline'"],
    styleSrc: ['https://cdn.jsdelivr.net', "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
  },
  referrerPolicy: 'no-referrer',
});

export const securityHeaders = createMiddleware<AppEnv>(async (c, next) =>
  c.req.path === '/api/docs' ? docs(c, next) : strict(c, next),
);

/** API responses contain personal data and must never be cached by browsers or proxies. */
export const noStore = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});
