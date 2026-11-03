import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { DeveloperDetailSchema, IdParamSchema, OkSchema, RestrictSchema } from '@meridian/shared';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { errors, json } from '../../lib/http';
import { actorOf, requireAuth, requirePermission } from '../../middleware/auth';
import { validationHook } from '../../middleware/error-handler';
import type { AppEnv, Deps } from '../../types';
import { findDeveloper, loadAggregate, toDetail } from '../developers/developer.repository';
import * as gdpr from './gdpr.service';
import { runRetention } from './retention.job';

const tags = ['gdpr'];

export function gdprRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  app.use('*', requireAuth);

  const detail = async (id: string, c: Parameters<typeof actorOf>[0]) => {
    const dev = await findDeveloper(deps.db, id);
    if (!dev) throw new AppError(404, 'NOT_FOUND', 'Developer not found');
    return toDetail(deps.db, await loadAggregate(deps.db, dev), actorOf(c));
  };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/developers/{id}/export',
      tags,
      summary: 'Art. 15 data export (JSON or PDF)',
      middleware: [requirePermission('gdpr:export')] as const,
      request: {
        params: IdParamSchema,
        query: z.object({ format: z.enum(['json', 'pdf']).default('json') }),
      },
      responses: {
        200: {
          description: 'Export',
          content: {
            'application/json': { schema: z.unknown() },
            'application/pdf': { schema: z.string().meta({ format: 'binary' }) },
          },
        },
        ...errors,
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { format } = c.req.valid('query');
      const data = await gdpr.exportDeveloperData(deps, id, actorOf(c));
      const name = `datenauskunft-${data.reference}`;
      if (format === 'pdf') {
        const pdf = await deps.pdf.render(gdpr.exportHtml(data));
        return c.body(pdf as Uint8Array<ArrayBuffer>, 200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${name}.pdf"`,
        });
      }
      return c.body(JSON.stringify(data, null, 2), 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}.json"`,
      });
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/developers/{id}/erase',
      tags,
      summary: 'Art. 17 erasure incl. stored files; requires typing the reference (e.g. "#007")',
      middleware: [requirePermission('gdpr:erase')] as const,
      request: {
        params: IdParamSchema,
        body: {
          content: {
            'application/json': { schema: z.object({ confirm: z.string().max(20) }).strict() },
          },
          required: true,
        },
      },
      responses: { 200: json(OkSchema), ...errors },
    }),
    async (c) => {
      await gdpr.eraseDeveloper(
        deps,
        c.req.valid('param').id,
        c.req.valid('json').confirm,
        actorOf(c),
      );
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/developers/{id}/restriction',
      tags,
      summary: 'Art. 18 restriction of processing (set or lift)',
      middleware: [requirePermission('gdpr:restrict')] as const,
      request: {
        params: IdParamSchema,
        body: { content: { 'application/json': { schema: RestrictSchema } }, required: true },
      },
      responses: { 200: json(DeveloperDetailSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const b = c.req.valid('json');
      await gdpr.setRestriction(deps, id, b.restricted, b.reason, actorOf(c));
      return c.json(await detail(id, c), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/developers/{id}/unflag',
      tags,
      summary: 'Remove a deletion flag set by the retention job',
      middleware: [requirePermission('gdpr:erase')] as const,
      request: { params: IdParamSchema },
      responses: { 200: json(DeveloperDetailSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      await gdpr.unflag(deps, id, actorOf(c));
      return c.json(await detail(id, c), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/retention/run',
      tags,
      summary: 'Run the retention job now',
      middleware: [requirePermission('settings:manage')] as const,
      responses: {
        200: json(
          z.object({
            flaggedRetention: z.number(),
            flaggedConsent: z.number(),
            skipped: z.boolean().optional(),
          }),
        ),
        ...errors,
      },
    }),
    async (c) => c.json(await runRetention(deps), 200),
  );

  return app;
}
