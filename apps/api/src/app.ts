import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { AppError } from './lib/errors';
import { RATE_LIMITS } from './lib/rate-limit';
import { loadSession, requireAuth, requirePermission } from './middleware/auth';
import { csrfProtection } from './middleware/csrf';
import { errorHandler, notFoundHandler, validationHook } from './middleware/error-handler';
import { rateLimit } from './middleware/rate-limit';
import { requestContext } from './middleware/request-context';
import { noStore, securityHeaders } from './middleware/security-headers';
import { authRoutes } from './modules/auth/auth.routes';
import { clientRoutes } from './modules/clients/client.routes';
import { developerRoutes } from './modules/developers/developer.routes';
import { documentRoutes } from './modules/documents/document.routes';
import { healthRoutes } from './modules/health/health.routes';
import { developerPdfRoutes, requestPdfRoutes } from './modules/pdf/pdf.routes';
import { requestRoutes } from './modules/requests/request.routes';
import { skillRoutes } from './modules/skills/skill.routes';
import type { AppEnv, Deps } from './types';

export function createApp(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  const origin = new URL(deps.env.BASE_URL).origin;

  app.use('*', requestContext(deps));
  app.use('*', securityHeaders);
  app.use('/api/*', noStore);
  app.use(
    '/api/*',
    cors({
      origin: (o) => (o === origin ? o : null),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id', 'Content-Disposition', 'Retry-After'],
      maxAge: 600,
    }),
  );
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: (deps.env.MAX_UPLOAD_MB + 1) * 1024 * 1024,
      onError: () => {
        throw new AppError(413, 'FILE_TOO_LARGE', 'Request body too large');
      },
    }),
  );
  app.use('/api/*', rateLimit(deps, 'global', RATE_LIMITS.global));
  app.use('/api/*', csrfProtection(deps));
  app.use('/api/*', loadSession(deps));

  app.route('/api/health', healthRoutes(deps));
  app.route('/api/auth', authRoutes(deps));
  app.route('/api/developers', developerRoutes(deps));
  app.route('/api/developers', documentRoutes(deps));
  app.route('/api/skills', skillRoutes(deps));
  app.route('/api/clients', clientRoutes(deps));
  app.route('/api/requests', requestRoutes(deps));
  app.route('/api/developers', developerPdfRoutes(deps));
  app.route('/api/requests', requestPdfRoutes(deps));

  if (deps.env.API_DOCS_ENABLED) {
    app.doc31('/api/openapi.json', {
      openapi: '3.1.0',
      info: {
        title: 'Meridian Talent API',
        version: '1.0.0',
        description: 'Internal talent system API',
      },
    });
    app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }));
  }

  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  return app;
}

export type App = ReturnType<typeof createApp>;
export { requireAuth, requirePermission };
