import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  IdParamSchema,
  MatchEntrySchema,
  OkSchema,
  ProposalStatusSchema,
  ProposeSchema,
  RequestInputSchema,
  RequestListQuerySchema,
  RequestSchema,
  RequestStatusUpdateSchema,
} from '@meridian/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requestDevelopers, requests } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { errors, json } from '../../lib/http';
import { actorOf, requireAuth, requirePermission } from '../../middleware/auth';
import { validationHook } from '../../middleware/error-handler';
import type { AppEnv, Deps } from '../../types';
import { writeAudit } from '../audit/audit.service';
import * as svc from './request.service';

const tags = ['requests'];
const body = <T>(schema: T) => ({
  body: { content: { 'application/json': { schema } }, required: true },
});
const ProposalParam = z.object({ id: z.uuid(), developerId: z.uuid() });

export function requestRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  app.use('*', requireAuth);
  const read = requirePermission('request:read');
  const write = requirePermission('request:write');

  app.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      middleware: [read] as const,
      request: { query: RequestListQuerySchema },
      responses: { 200: json(z.array(RequestSchema)), ...errors },
    }),
    async (c) => c.json(await svc.loadRequests(deps.db, c.req.valid('query')), 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/{id}',
      tags,
      middleware: [read] as const,
      request: { params: IdParamSchema },
      responses: { 200: json(RequestSchema), ...errors },
    }),
    async (c) => c.json(await svc.getRequest(deps.db, c.req.valid('param').id), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags,
      middleware: [write] as const,
      request: body(RequestInputSchema),
      responses: { 201: json(RequestSchema, 'Created'), ...errors },
    }),
    async (c) => c.json(await svc.saveRequest(deps, c.req.valid('json'), actorOf(c)), 201),
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/{id}',
      tags,
      middleware: [write] as const,
      request: { params: IdParamSchema, ...body(RequestInputSchema) },
      responses: { 200: json(RequestSchema), ...errors },
    }),
    async (c) =>
      c.json(
        await svc.saveRequest(deps, c.req.valid('json'), actorOf(c), c.req.valid('param').id),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/{id}/status',
      tags,
      middleware: [write] as const,
      request: { params: IdParamSchema, ...body(RequestStatusUpdateSchema) },
      responses: { 200: json(RequestSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { status } = c.req.valid('json');
      const before = await svc.getRequest(deps.db, id);
      await deps.db.update(requests).set({ status }).where(eq(requests.id, id));
      await writeAudit(deps.db, actorOf(c), {
        action: 'request.status',
        entity: 'request',
        entityId: id,
        diff: { from: before.status, to: status },
      });
      return c.json(await svc.getRequest(deps.db, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}',
      tags,
      middleware: [write] as const,
      request: { params: IdParamSchema },
      responses: { 200: json(OkSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      await svc.getRequest(deps.db, id);
      await deps.db.transaction(async (tx) => {
        await tx.update(requests).set({ deletedAt: deps.now() }).where(eq(requests.id, id));
        await tx.delete(requestDevelopers).where(eq(requestDevelopers.requestId, id));
        await writeAudit(tx, actorOf(c), {
          action: 'request.delete',
          entity: 'request',
          entityId: id,
        });
      });
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/{id}/matches',
      tags,
      summary: 'Ranked matching (only Pool 2 developers)',
      middleware: [requirePermission('matching:read')] as const,
      request: { params: IdParamSchema },
      responses: { 200: json(z.array(MatchEntrySchema)), ...errors },
    }),
    async (c) => c.json(await svc.matchRequest(deps.db, c.req.valid('param').id), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/proposals',
      tags,
      summary: 'Propose an approved developer (first proposal moves the request to "proposed")',
      middleware: [write] as const,
      request: { params: IdParamSchema, ...body(ProposeSchema) },
      responses: { 201: json(RequestSchema, 'Created'), ...errors },
    }),
    async (c) =>
      c.json(
        await svc.propose(
          deps,
          c.req.valid('param').id,
          c.req.valid('json').developerId,
          actorOf(c),
        ),
        201,
      ),
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}/proposals/{developerId}',
      tags,
      middleware: [write] as const,
      request: { params: ProposalParam },
      responses: { 200: json(RequestSchema), ...errors },
    }),
    async (c) => {
      const p = c.req.valid('param');
      return c.json(await svc.unpropose(deps, p.id, p.developerId, actorOf(c)), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/{id}/proposals/{developerId}',
      tags,
      middleware: [write] as const,
      request: { params: ProposalParam, ...body(ProposalStatusSchema) },
      responses: { 200: json(RequestSchema), ...errors },
    }),
    async (c) => {
      const p = c.req.valid('param');
      const { status } = c.req.valid('json');
      const updated = await deps.db
        .update(requestDevelopers)
        .set({ status })
        .where(
          and(
            eq(requestDevelopers.requestId, p.id),
            eq(requestDevelopers.developerId, p.developerId),
          ),
        )
        .returning();
      if (!updated.length) throw new AppError(404, 'NOT_FOUND', 'Proposal not found');
      await writeAudit(deps.db, actorOf(c), {
        action: 'request.proposal.status',
        entity: 'request',
        entityId: p.id,
        diff: { developerId: p.developerId, status },
      });
      return c.json(await svc.getRequest(deps.db, p.id), 200);
    },
  );

  return app;
}
