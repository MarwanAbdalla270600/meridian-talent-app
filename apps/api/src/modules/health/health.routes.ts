import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { json } from '../../lib/http';
import type { AppEnv, Deps } from '../../types';

const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.boolean(),
  version: z.string(),
});

export function healthRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>();
  app.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags: ['health'],
      summary: 'Liveness/readiness (checks the database)',
      responses: { 200: json(HealthSchema), 503: json(HealthSchema, 'Unhealthy') },
    }),
    async (c) => {
      let db: boolean;
      try {
        await deps.db.execute(sql`select 1`);
        db = true;
      } catch {
        db = false;
      }
      const body = {
        status: db ? ('ok' as const) : ('degraded' as const),
        db,
        version: process.env.APP_VERSION ?? 'dev',
      };
      return db ? c.json(body, 200) : c.json(body, 503);
    },
  );
  return app;
}
