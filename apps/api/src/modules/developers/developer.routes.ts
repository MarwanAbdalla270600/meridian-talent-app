import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  DeveloperCreateSchema,
  DeveloperDetailSchema,
  DeveloperListItemSchema,
  DeveloperListQuerySchema,
  DeveloperUpdateSchema,
  IdParamSchema,
  OkSchema,
  paginated,
  TransitionSchema,
} from '@meridian/shared';
import { errors, json } from '../../lib/http';
import { actorOf, requireAuth, requirePermission } from '../../middleware/auth';
import { validationHook } from '../../middleware/error-handler';
import type { AppEnv, Deps } from '../../types';
import { listDevelopers, toDetail } from './developer.repository';
import * as svc from './developer.service';

const tags = ['developers'];
const body = <T>(schema: T) => ({
  body: { content: { 'application/json': { schema } }, required: true },
});

export function developerRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  app.use('*', requireAuth);

  app.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      summary: 'List developers (search, filters, sorting, pagination)',
      middleware: [requirePermission('developer:list')] as const,
      request: { query: DeveloperListQuerySchema },
      responses: { 200: json(paginated(DeveloperListItemSchema)), ...errors },
    }),
    async (c) => {
      const today = deps.now().toISOString().slice(0, 10);
      return c.json(await listDevelopers(deps.db, c.req.valid('query'), today), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags,
      summary: 'Create a developer (always starts in Pool 1)',
      middleware: [requirePermission('developer:create')] as const,
      request: body(DeveloperCreateSchema),
      responses: { 201: json(DeveloperDetailSchema, 'Created'), ...errors },
    }),
    async (c) => {
      const actor = actorOf(c);
      const agg = await svc.createDeveloper(deps, c.req.valid('json'), actor);
      return c.json(await toDetail(deps.db, agg, actor), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/{id}',
      tags,
      summary: 'Developer profile in the unified schema',
      middleware: [requirePermission('developer:read')] as const,
      request: { params: IdParamSchema },
      responses: { 200: json(DeveloperDetailSchema), ...errors },
    }),
    async (c) => {
      const actor = actorOf(c);
      const agg = await svc.getDeveloper(deps, c.req.valid('param').id, actor);
      return c.json(await toDetail(deps.db, agg, actor), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'put',
      path: '/{id}',
      tags,
      summary: 'Replace the profile content (optimistic locking via version)',
      middleware: [requirePermission('developer:update')] as const,
      request: { params: IdParamSchema, ...body(DeveloperUpdateSchema) },
      responses: { 200: json(DeveloperDetailSchema), ...errors },
    }),
    async (c) => {
      const actor = actorOf(c);
      const agg = await svc.updateDeveloper(
        deps,
        c.req.valid('param').id,
        c.req.valid('json'),
        actor,
      );
      return c.json(await toDetail(deps.db, agg, actor), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}',
      tags,
      summary: 'Soft-delete a developer (Austria/Admin)',
      middleware: [requirePermission('developer:delete')] as const,
      request: { params: IdParamSchema },
      responses: { 200: json(OkSchema), ...errors },
    }),
    async (c) => {
      await svc.softDeleteDeveloper(deps, c.req.valid('param').id, actorOf(c));
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/transitions',
      tags,
      summary: 'Workflow event: submit | approve | return (note required) | demote',
      request: { params: IdParamSchema, ...body(TransitionSchema) },
      responses: { 200: json(DeveloperDetailSchema), ...errors },
    }),
    async (c) => {
      const actor = actorOf(c);
      const agg = await svc.transitionDeveloper(
        deps,
        c.req.valid('param').id,
        c.req.valid('json'),
        actor,
      );
      return c.json(await toDetail(deps.db, agg, actor), 200);
    },
  );

  return app;
}
