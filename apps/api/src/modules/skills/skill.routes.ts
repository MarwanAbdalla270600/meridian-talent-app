import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  can,
  IdParamSchema,
  OkSchema,
  SkillCreateSchema,
  SkillListQuerySchema,
  SkillMergeSchema,
  SkillSchema,
  SkillUpdateSchema,
} from '@meridian/shared';
import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { developerSkills, requestSkills, skills } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { errors, json } from '../../lib/http';
import { actorOf, requireAuth, requirePermission } from '../../middleware/auth';
import { validationHook } from '../../middleware/error-handler';
import type { AppEnv, Deps } from '../../types';
import { writeAudit } from '../audit/audit.service';
import { findInCatalog, mergeSkill } from './skill.service';

const tags = ['skills'];
const usage = sql<number>`(select count(*)::int from ${developerSkills} ds where ds.skill_id = ${skills.id})`;
const body = <T>(schema: T) => ({
  body: { content: { 'application/json': { schema } }, required: true },
});

export function skillRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  app.use('*', requireAuth);

  const getOne = async (id: string) => {
    const [row] = await deps.db
      .select({ s: skills, usageCount: usage })
      .from(skills)
      .where(eq(skills.id, id));
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Skill not found');
    return {
      ...row.s,
      usageCount: row.usageCount,
      proposedBy: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    };
  };
  const dto = (s: Awaited<ReturnType<typeof getOne>>) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    aliases: s.aliases,
    status: s.status,
    usageCount: s.usageCount,
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      summary: 'Skill catalog (autocomplete)',
      middleware: [requirePermission('skill:read')] as const,
      request: { query: SkillListQuerySchema },
      responses: { 200: json(z.array(SkillSchema)), ...errors },
    }),
    async (c) => {
      const q = c.req.valid('query');
      const where: SQL[] = [];
      if (q.status) where.push(eq(skills.status, q.status));
      if (q.q) {
        const like = `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
        where.push(
          or(
            ilike(skills.name, like),
            sql`exists (select 1 from unnest(${skills.aliases}) a where a ilike ${like})`,
          )!,
        );
      }
      const rows = await deps.db
        .select({ s: skills, usageCount: usage })
        .from(skills)
        .where(where.length ? and(...where) : undefined)
        .orderBy(asc(skills.name))
        .limit(500);
      return c.json(
        rows.map((r) =>
          dto({
            ...r.s,
            usageCount: r.usageCount,
            proposedBy: undefined,
            createdAt: undefined,
            updatedAt: undefined,
          }),
        ),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags,
      summary: 'Propose (Egypt → pending) or create (Austria/Admin → approved) a skill',
      middleware: [requirePermission('skill:propose')] as const,
      request: body(SkillCreateSchema),
      responses: { 201: json(SkillSchema, 'Created'), ...errors },
    }),
    async (c) => {
      const actor = actorOf(c);
      const input = c.req.valid('json');
      const catalog = await deps.db.select().from(skills);
      const existing = findInCatalog(catalog, input.name);
      if (existing)
        throw new AppError(409, 'CONFLICT', 'Skill already exists', {
          id: existing.id,
          name: existing.name,
        });
      const status = can(actor.role, 'skill:manage') ? 'approved' : 'pending';
      const [s] = await deps.db
        .insert(skills)
        .values({
          name: input.name,
          category: input.category,
          aliases: input.aliases,
          status,
          proposedBy: actor.id,
        })
        .returning();
      await writeAudit(deps.db, actor, {
        action: status === 'pending' ? 'skill.proposed' : 'skill.create',
        entity: 'skill',
        entityId: s!.id,
        diff: input,
      });
      return c.json(dto(await getOne(s!.id)), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/{id}',
      tags,
      summary: 'Edit or approve a skill (Austria/Admin)',
      middleware: [requirePermission('skill:manage')] as const,
      request: { params: IdParamSchema, ...body(SkillUpdateSchema) },
      responses: { 200: json(SkillSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const patch = c.req.valid('json');
      const before = await getOne(id);
      await deps.db.update(skills).set(patch).where(eq(skills.id, id));
      await writeAudit(deps.db, actorOf(c), {
        action:
          patch.status === 'approved' && before.status === 'pending'
            ? 'skill.approve'
            : 'skill.update',
        entity: 'skill',
        entityId: id,
        diff: patch,
      });
      return c.json(dto(await getOne(id)), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/merge',
      tags,
      summary: 'Merge a (pending) skill into an existing one',
      middleware: [requirePermission('skill:manage')] as const,
      request: { params: IdParamSchema, ...body(SkillMergeSchema) },
      responses: { 200: json(SkillSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { targetId } = c.req.valid('json');
      await deps.db.transaction((tx) => mergeSkill(tx, id, targetId, actorOf(c)));
      return c.json(dto(await getOne(targetId)), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}',
      tags,
      summary: 'Delete an unused skill',
      middleware: [requirePermission('skill:manage')] as const,
      request: { params: IdParamSchema },
      responses: { 200: json(OkSchema), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const s = await getOne(id);
      const [inRequests] = await deps.db
        .select({ n: sql<number>`count(*)::int` })
        .from(requestSkills)
        .where(eq(requestSkills.skillId, id));
      if (s.usageCount > 0 || (inRequests?.n ?? 0) > 0)
        throw new AppError(409, 'CONFLICT', 'Skill is in use; merge it instead');
      await deps.db.delete(skills).where(eq(skills.id, id));
      await writeAudit(deps.db, actorOf(c), {
        action: 'skill.delete',
        entity: 'skill',
        entityId: id,
        diff: { name: s.name },
      });
      return c.json({ ok: true as const }, 200);
    },
  );

  return app;
}
