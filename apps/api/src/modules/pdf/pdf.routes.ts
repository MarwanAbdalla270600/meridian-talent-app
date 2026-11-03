import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { IdParamSchema, PdfQuerySchema } from '@meridian/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { developers } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { errors } from '../../lib/http';
import { RATE_LIMITS } from '../../lib/rate-limit';
import { actorOf, assertCan, requireAuth, requirePermission } from '../../middleware/auth';
import { validationHook } from '../../middleware/error-handler';
import { rateLimit } from '../../middleware/rate-limit';
import { refOf, renderBundleHtml, renderProfileHtml } from '../../templates/profile.template';
import type { AppEnv, Deps } from '../../types';
import { writeAudit } from '../audit/audit.service';
import { findDeveloper, loadAggregate } from '../developers/developer.repository';
import { getRequest, matchRequest } from '../requests/request.service';

const pdfResponse = {
  200: {
    description: 'PDF document',
    content: { 'application/pdf': { schema: z.string().meta({ format: 'binary' }) } },
  },
};

const pdfHeaders = (filename: string) => ({
  'Content-Type': 'application/pdf',
  'Content-Disposition': `attachment; filename="${filename}"`,
  'Cache-Control': 'no-store',
});

export function developerPdfRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  app.use('*', requireAuth);

  app.openapi(
    createRoute({
      method: 'get',
      path: '/{id}/pdf',
      tags: ['pdf'],
      summary: 'Client profile PDF (only Pool 2; anonymised by default; audited)',
      middleware: [
        requirePermission('pdf:generate'),
        rateLimit(deps, 'pdf', RATE_LIMITS.pdf, 'user'),
      ] as const,
      request: { params: IdParamSchema, query: PdfQuerySchema },
      responses: { ...pdfResponse, ...errors },
    }),
    async (c) => {
      const actor = actorOf(c);
      const { id } = c.req.valid('param');
      const opts = c.req.valid('query');
      const dev = await findDeveloper(deps.db, id);
      if (!dev) throw new AppError(404, 'NOT_FOUND', 'Developer not found');
      assertCan(actor, 'pdf:generate', {
        status: dev.status,
        processingRestricted: dev.processingRestricted,
      });
      const agg = await loadAggregate(deps.db, dev);
      const today = deps.now().toISOString().slice(0, 10);
      const pdf = await deps.pdf.render(renderProfileHtml(agg, opts, today));
      await writeAudit(deps.db, actor, {
        action: 'pdf.export',
        entity: 'developer',
        entityId: id,
        diff: opts,
      });
      return c.body(
        pdf as Uint8Array<ArrayBuffer>,
        200,
        pdfHeaders(`profil-${refOf(dev.publicRef)}-${opts.variant}-${opts.lang}.pdf`),
      );
    },
  );
  return app;
}

export function requestPdfRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  app.use('*', requireAuth);

  app.openapi(
    createRoute({
      method: 'get',
      path: '/{id}/pdf',
      tags: ['pdf'],
      summary: 'Combined PDF: cover page + all proposed, approved profiles of a request',
      middleware: [
        requirePermission('pdf:generate'),
        rateLimit(deps, 'pdf', RATE_LIMITS.pdf, 'user'),
      ] as const,
      request: { params: IdParamSchema, query: PdfQuerySchema },
      responses: { ...pdfResponse, ...errors },
    }),
    async (c) => {
      const actor = actorOf(c);
      const { id } = c.req.valid('param');
      const opts = c.req.valid('query');
      const req = await getRequest(deps.db, id);
      const ids = req.proposals.map((p) => p.developerId);
      const devs = ids.length
        ? await deps.db
            .select()
            .from(developers)
            .where(
              and(
                inArray(developers.id, ids),
                isNull(developers.deletedAt),
                eq(developers.status, 'P2_FREIGEGEBEN'),
                eq(developers.processingRestricted, false),
              ),
            )
        : [];
      if (!devs.length)
        throw new AppError(409, 'NOT_CLIENT_READY', 'No approved proposals for this request');
      const order = new Map(ids.map((d, i) => [d, i]));
      devs.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      const aggs = [];
      for (const d of devs) aggs.push(await loadAggregate(deps.db, d));
      const scores = new Map(
        (await matchRequest(deps.db, id)).map((m) => [m.developerId, m.score]),
      );
      const today = deps.now().toISOString().slice(0, 10);
      const html = renderBundleHtml(
        aggs,
        { requestTitle: req.title, clientName: req.clientName, startBy: req.startBy, scores },
        opts,
        today,
      );
      const pdf = await deps.pdf.render(html);
      await writeAudit(deps.db, actor, {
        action: 'pdf.export_bundle',
        entity: 'request',
        entityId: id,
        diff: { ...opts, developerIds: devs.map((d) => d.id) },
      });
      return c.body(
        pdf as Uint8Array<ArrayBuffer>,
        200,
        pdfHeaders(`anfrage-${req.id.slice(0, 8)}-${opts.variant}-${opts.lang}.pdf`),
      );
    },
  );
  return app;
}
