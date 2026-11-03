import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  IdParamSchema,
  OkSchema,
  UserCreateSchema,
  UserSchema,
  UserUpdateSchema,
} from '@meridian/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { sessions, users } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { errors, iso, isoReq, json } from '../../lib/http';
import { actorOf, requireAuth, requirePermission } from '../../middleware/auth';
import { validationHook } from '../../middleware/error-handler';
import type { AppEnv, Deps } from '../../types';
import { diffObjects, writeAudit } from '../audit/audit.service';
import { sendPasswordLink } from '../auth/auth.service';

const tags = ['admin'];
const body = <T>(schema: T) => ({
  body: { content: { 'application/json': { schema } }, required: true },
});
type UserRow = typeof users.$inferSelect;

const toDto = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  role: u.role,
  locale: u.locale,
  isActive: u.isActive,
  totpEnabled: u.totpEnabled,
  lastLoginAt: iso(u.lastLoginAt),
  lockedUntil: u.lockedUntil && u.lockedUntil > new Date() ? isoReq(u.lockedUntil) : null,
  createdAt: isoReq(u.createdAt),
});

export function userRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  app.use('*', requireAuth, requirePermission('user:manage'));

  const get = async (id: string) => {
    const [u] = await deps.db.select().from(users).where(eq(users.id, id));
    if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found');
    return u;
  };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      responses: { 200: json(z.array(UserSchema)), ...errors },
    }),
    async (c) =>
      c.json((await deps.db.select().from(users).orderBy(asc(users.displayName))).map(toDto), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags,
      summary: 'Create a user; an invitation link (set password) is e-mailed',
      request: body(UserCreateSchema),
      responses: { 201: json(UserSchema, 'Created'), ...errors },
    }),
    async (c) => {
      const input = c.req.valid('json');
      const actor = actorOf(c);
      const [exists] = await deps.db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = lower(${input.email})`);
      if (exists) throw new AppError(409, 'CONFLICT', 'E-mail already in use');
      const [u] = await deps.db
        .insert(users)
        .values({ ...input, passwordHash: null })
        .returning();
      await writeAudit(deps.db, actor, {
        action: 'user.create',
        entity: 'user',
        entityId: u!.id,
        diff: { role: input.role },
      });
      await sendPasswordLink(deps, u!, 'invite', actor);
      return c.json(toDto(u!), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/{id}',
      tags,
      summary:
        'Change name, role, language or active state (sessions end on role change/deactivation)',
      request: { params: IdParamSchema, ...body(UserUpdateSchema) },
      responses: { 200: json(UserSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const patch = c.req.valid('json');
      const actor = actorOf(c);
      if (id === actor.id && (patch.role !== undefined || patch.isActive === false)) {
        throw new AppError(
          409,
          'CONFLICT',
          'You cannot change your own role or deactivate yourself',
        );
      }
      const before = await get(id);
      const [u] = await deps.db.update(users).set(patch).where(eq(users.id, id)).returning();
      if ((patch.role && patch.role !== before.role) || patch.isActive === false) {
        await deps.db.delete(sessions).where(eq(sessions.userId, id));
      }
      await writeAudit(deps.db, actor, {
        action: 'user.update',
        entity: 'user',
        entityId: id,
        diff: diffObjects(
          {
            displayName: before.displayName,
            role: before.role,
            locale: before.locale,
            isActive: before.isActive,
          },
          {
            displayName: u!.displayName,
            role: u!.role,
            locale: u!.locale,
            isActive: u!.isActive,
          },
        ),
      });
      return c.json(toDto(u!), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/reset-link',
      tags,
      request: { params: IdParamSchema },
      responses: { 200: json(OkSchema), ...errors },
    }),
    async (c) => {
      const u = await get(c.req.valid('param').id);
      if (!u.isActive) throw new AppError(409, 'CONFLICT', 'User is deactivated');
      await sendPasswordLink(deps, u, 'reset', actorOf(c));
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/unlock',
      tags,
      request: { params: IdParamSchema },
      responses: { 200: json(UserSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      await get(id);
      const [u] = await deps.db
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, id))
        .returning();
      await writeAudit(deps.db, actorOf(c), {
        action: 'user.unlock',
        entity: 'user',
        entityId: id,
      });
      return c.json(toDto(u!), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/reset-totp',
      tags,
      request: { params: IdParamSchema },
      responses: { 200: json(UserSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      await get(id);
      const [u] = await deps.db
        .update(users)
        .set({ totpEnabled: false, totpSecret: null })
        .where(eq(users.id, id))
        .returning();
      await deps.db.delete(sessions).where(eq(sessions.userId, id));
      await writeAudit(deps.db, actorOf(c), {
        action: 'user.reset_totp',
        entity: 'user',
        entityId: id,
      });
      return c.json(toDto(u!), 200);
    },
  );

  return app;
}
