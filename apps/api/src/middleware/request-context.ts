import { createMiddleware } from 'hono/factory';
import { getConnInfo } from 'hono/bun';
import { clientIp } from '../lib/http';
import type { AppEnv, Deps } from '../types';

/** Request id, client IP, scoped logger and a PII-free access log line. */
export const requestContext = (deps: Deps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    let connIp: string | null;
    try {
      connIp = getConnInfo(c).remote.address ?? null;
    } catch {
      connIp = null; // e.g. app.request() in tests
    }
    c.set('requestId', requestId);
    c.set('ip', clientIp(c, deps.env.TRUST_PROXY, connIp));
    c.set('logger', deps.logger.child({ requestId }));
    c.set('user', null);
    c.set('session', null);
    const start = performance.now();
    await next();
    c.header('X-Request-Id', requestId);
    // Query strings are not logged: they may contain search terms with personal data.
    c.var.logger.info('request', {
      method: c.req.method,
      route: c.req.routePath,
      status: c.res.status,
      durationMs: Math.round(performance.now() - start),
      userId: c.var.user?.id,
    });
  });
