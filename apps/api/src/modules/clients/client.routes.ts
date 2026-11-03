import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { ClientInputSchema, ClientSchema, IdParamSchema, OkSchema } from '@meridian/shared';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { clients, requests } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { errors, isoReq, json } from '../../lib/http';
import { actorOf, requireAuth, requirePermission } from '../../middleware/auth';
import { validationHook } from '../../middleware/error-handler';
import type { AppEnv, Deps } from '../../types';
import { diffObjects, writeAudit } from '../audit/audit.service';

const tags = ['clients'];
const OPEN = ['open', 'proposed', 'interview'] as const;
const body = <T>(schema: T) => ({
  body: { content: { 'application/json': { schema } }, required: true },
});

export function clientRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  app.use('*', requireAuth);

  const requestCount = sql<number>`(select count(*)::int from ${requests} r where r.client_id = "clients"."id" and r.deleted_at is null)`;
  const openCount = sql<number>`(select count(*)::int from ${requests} r where r.client_id = "clients"."id" and r.deleted_at is null and r.status in ('open','proposed','interview'))`;

  const list = async (id?: string) => {
    const rows = await deps.db
      .select({ c: clients, requestCount, openRequestCount: openCount })
      .from(clients)
      .where(and(isNull(clients.deletedAt), id ? eq(clients.id, id) : undefined))
      .orderBy(asc(clients.name));
    return rows.map(({ c, requestCount: rc, openRequestCount }) => ({
      id: c.id,
      name: c.name,
      contactName: c.contactName,
      contactEmail: c.contactEmail,
      note: c.note,
      requestCount: rc,
      openRequestCount,
      createdAt: isoReq(c.createdAt),
    }));
  };
  const one = async (id: string) => {
    const [c] = await list(id);
    if (!c) throw new AppError(404, 'NOT_FOUND', 'Client not found');
    return c;
  };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      middleware: [requirePermission('client:read')] as const,
      responses: { 200: json(z.array(ClientSchema)), ...errors },
    }),
    async (c) => c.json(await list(), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags,
      middleware: [requirePermission('client:write')] as const,
      request: body(ClientInputSchema),
      responses: { 201: json(ClientSchema, 'Created'), ...errors },
    }),
    async (c) => {
      const input = c.req.valid('json');
      const [row] = await deps.db.insert(clients).values(input).returning();
      await writeAudit(deps.db, actorOf(c), {
        action: 'client.create',
        entity: 'client',
        entityId: row!.id,
        diff: diffObjects({}, input),
      });
      return c.json(await one(row!.id), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/{id}',
      tags,
      middleware: [requirePermission('client:write')] as const,
      request: { params: IdParamSchema, ...body(ClientInputSchema) },
      responses: { 200: json(ClientSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const before = await one(id);
      await deps.db.update(clients).set(input).where(eq(clients.id, id));
      await writeAudit(deps.db, actorOf(c), {
        action: 'client.update',
        entity: 'client',
        entityId: id,
        diff: diffObjects(
          {
            name: before.name,
            contactName: before.contactName,
            contactEmail: before.contactEmail,
            note: before.note,
          },
          input,
        ),
      });
      return c.json(await one(id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}',
      tags,
      summary: 'Soft-delete a client without open requests',
      middleware: [requirePermission('client:write')] as const,
      request: { params: IdParamSchema },
      responses: { 200: json(OkSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      await one(id);
      const open = await deps.db
        .select({ id: requests.id })
        .from(requests)
        .where(
          and(
            eq(requests.clientId, id),
            isNull(requests.deletedAt),
            inArray(requests.status, [...OPEN]),
          ),
        );
      if (open.length) throw new AppError(409, 'CONFLICT', 'Client has open requests');
      await deps.db.update(clients).set({ deletedAt: deps.now() }).where(eq(clients.id, id));
      await writeAudit(deps.db, actorOf(c), {
        action: 'client.delete',
        entity: 'client',
        entityId: id,
      });
      return c.json({ ok: true as const }, 200);
    },
  );

  return app;
}
