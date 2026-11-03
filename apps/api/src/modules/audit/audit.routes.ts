import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  AuditEntrySchema,
  AuditQuerySchema,
  paginated,
  SettingsSchema,
  SettingsUpdateSchema,
} from '@meridian/shared';
import { and, desc, eq, gte, like, lt, sql, type SQL } from 'drizzle-orm';
import { auditLog, users } from '../../db/schema';
import { errors, isoReq, json } from '../../lib/http';
import { actorOf, requireAuth, requirePermission } from '../../middleware/auth';
import { validationHook } from '../../middleware/error-handler';
import type { AppEnv, Deps } from '../../types';
import { getSettings, saveSettings } from '../settings/settings.service';
import { diffObjects, writeAudit } from './audit.service';

export function auditAndSettingsRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  app.use('*', requireAuth);

  app.openapi(
    createRoute({
      method: 'get',
      path: '/audit',
      tags: ['admin'],
      summary: 'Audit log (read-only, admin)',
      middleware: [requirePermission('audit:read')] as const,
      request: { query: AuditQuerySchema },
      responses: { 200: json(paginated(AuditEntrySchema)), ...errors },
    }),
    async (c) => {
      const q = c.req.valid('query');
      const where: SQL[] = [];
      if (q.actorId) where.push(eq(auditLog.actorId, q.actorId));
      if (q.entity) where.push(eq(auditLog.entity, q.entity));
      if (q.entityId) where.push(eq(auditLog.entityId, q.entityId));
      if (q.action)
        where.push(like(auditLog.action, `${q.action.replace(/[\\%_]/g, (m) => `\\${m}`)}%`));
      if (q.from) where.push(gte(auditLog.createdAt, new Date(`${q.from}T00:00:00Z`)));
      if (q.to)
        where.push(
          lt(auditLog.createdAt, new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 864e5)),
        );
      const cond = where.length ? and(...where) : undefined;
      const [rows, [total]] = await Promise.all([
        deps.db
          .select({ a: auditLog, actorName: users.displayName })
          .from(auditLog)
          .leftJoin(users, eq(users.id, auditLog.actorId))
          .where(cond)
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
          .limit(q.pageSize)
          .offset((q.page - 1) * q.pageSize),
        deps.db
          .select({ n: sql<number>`count(*)::int` })
          .from(auditLog)
          .where(cond),
      ]);
      return c.json(
        {
          items: rows.map(({ a, actorName }) => ({
            id: a.id,
            actorId: a.actorId,
            actorName,
            action: a.action,
            entity: a.entity,
            entityId: a.entityId,
            diff: a.diff,
            ip: a.ip,
            createdAt: isoReq(a.createdAt),
          })),
          total: total?.n ?? 0,
          page: q.page,
          pageSize: q.pageSize,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/settings',
      tags: ['admin'],
      middleware: [requirePermission('settings:manage')] as const,
      responses: { 200: json(SettingsSchema), ...errors },
    }),
    async (c) => c.json(await getSettings(deps.db, deps.env), 200),
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/settings',
      tags: ['admin'],
      middleware: [requirePermission('settings:manage')] as const,
      request: {
        body: { content: { 'application/json': { schema: SettingsUpdateSchema } }, required: true },
      },
      responses: { 200: json(SettingsSchema), ...errors },
    }),
    async (c) => {
      const patch = c.req.valid('json');
      const before = await getSettings(deps.db, deps.env);
      await saveSettings(deps.db, patch);
      const after = await getSettings(deps.db, deps.env);
      await writeAudit(deps.db, actorOf(c), {
        action: 'settings.update',
        entity: 'settings',
        diff: diffObjects(before, after),
      });
      return c.json(after, 200);
    },
  );

  return app;
}
