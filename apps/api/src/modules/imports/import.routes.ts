import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  CvExtractionSchema,
  DeveloperDetailSchema,
  IdParamSchema,
  IMPORT_REVIEW_SECTIONS,
  ImportConfirmSchema,
  ImportSchema,
  type DeveloperCreateInput,
  type ImportDto,
} from '@meridian/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { cvImports, documents } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { MIME, validateUpload } from '../../lib/files';
import { errors, isoReq, json } from '../../lib/http';
import { RATE_LIMITS } from '../../lib/rate-limit';
import { actorOf, requireAuth, requirePermission } from '../../middleware/auth';
import { validationHook } from '../../middleware/error-handler';
import { rateLimit } from '../../middleware/rate-limit';
import type { Actor, AppEnv, Deps } from '../../types';
import { writeAudit } from '../audit/audit.service';
import { toDetail } from '../developers/developer.repository';
import { createDeveloper } from '../developers/developer.service';
import { storeDocument } from '../documents/document.service';
import { ExtractionError } from './extractor';

const tags = ['imports'];
type ImportRow = typeof cvImports.$inferSelect;

const EMPTY_DRAFT: DeveloperCreateInput = {
  firstName: null,
  lastName: null,
  email: null,
  phone: null,
  title: null,
  seniority: 'mid',
  location: 'Remote',
  availableFrom: null,
  currency: 'EUR',
  isPlaced: false,
  summaryDe: null,
  summaryEn: null,
  educationDe: null,
  educationEn: null,
  internalNote: null,
  consentGiven: false,
  consentAt: null,
  consentVersion: null,
  skills: [],
  experiences: [],
  certifications: [],
  languages: [],
};

export function importRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  app.use('*', requireAuth, requirePermission('import:cv'));

  const dto = async (row: ImportRow): Promise<ImportDto> => {
    const [doc] = await deps.db
      .select({ filename: documents.filename })
      .from(documents)
      .where(eq(documents.id, row.documentId));
    const parsed = row.extraction ? CvExtractionSchema.safeParse(row.extraction) : null;
    return {
      id: row.id,
      status: row.status,
      filename: doc?.filename ?? '',
      errorCode: row.errorCode,
      model: row.model,
      extraction: parsed?.success ? parsed.data : null,
      developerId: row.developerId,
      createdAt: isoReq(row.createdAt),
    };
  };

  /** Imports are visible to their creator and to Austria/Admin. */
  const load = async (id: string, actor: Actor) => {
    const [row] = await deps.db.select().from(cvImports).where(eq(cvImports.id, id));
    if (!row || (actor.role === 'egypt_editor' && row.createdBy !== actor.id))
      throw new AppError(404, 'NOT_FOUND', 'Import not found');
    return row;
  };

  const finish = async (
    row: ImportRow,
    input: DeveloperCreateInput,
    actor: Actor,
    mode: 'reviewed' | 'manual',
  ) => {
    const agg = await createDeveloper(deps, input, actor);
    await deps.db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({ developerId: agg.dev.id })
        .where(eq(documents.id, row.documentId));
      // Data minimisation: the raw extraction is no longer needed once the draft exists.
      await tx
        .update(cvImports)
        .set({ status: 'completed', developerId: agg.dev.id, extraction: null })
        .where(eq(cvImports.id, row.id));
      await writeAudit(tx, actor, {
        action: mode === 'reviewed' ? 'import.confirm' : 'import.manual',
        entity: 'developer',
        entityId: agg.dev.id,
        diff: {
          importId: row.id,
          model: row.model,
          ...(mode === 'reviewed' ? { confirmedSections: IMPORT_REVIEW_SECTIONS } : {}),
        },
      });
    });
    return toDetail(deps.db, agg, actor);
  };

  app.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags,
      summary:
        'Upload a CV; extracts a draft via AI when enabled (never saved without human review)',
      middleware: [rateLimit(deps, 'upload', RATE_LIMITS.upload, 'user')] as const,
      request: {
        body: {
          content: { 'multipart/form-data': { schema: z.object({ file: z.any() }) } },
          required: true,
        },
      },
      responses: { 201: json(ImportSchema, 'Created'), ...errors },
    }),
    async (c) => {
      const actor = actorOf(c);
      const form = await c.req.formData();
      const file = await validateUpload(form.get('file'), deps.env.MAX_UPLOAD_MB * 1024 * 1024, [
        MIME.pdf,
        MIME.docx,
      ]);
      const doc = await storeDocument(deps, file, 'cv', null, actor);
      const [row] = await deps.db
        .insert(cvImports)
        .values({
          documentId: doc.id,
          status: deps.extractor ? 'processing' : 'manual',
          createdBy: actor.id,
        })
        .returning();
      if (!deps.extractor) return c.json(await dto(row!), 201);

      let result: ImportRow;
      try {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ExtractionError('IMPORT_TIMEOUT', 'timeout')),
            deps.env.CV_IMPORT_TIMEOUT_MS + 5_000,
          );
        });
        const out = await Promise.race([
          deps.extractor.extract({ bytes: file.bytes, mime: file.mime, filename: file.filename }),
          timeout,
        ]).finally(() => clearTimeout(timer));
        [result] = (await deps.db
          .update(cvImports)
          .set({ status: 'extracted', model: out.model, extraction: out.extraction })
          .where(eq(cvImports.id, row!.id))
          .returning()) as [ImportRow];
      } catch (err) {
        const code = err instanceof ExtractionError ? err.code : 'IMPORT_FAILED';
        if (!(err instanceof ExtractionError))
          c.var.logger.error('cv extraction crashed', { error: err });
        [result] = (await deps.db
          .update(cvImports)
          .set({ status: 'failed', errorCode: code })
          .where(eq(cvImports.id, row!.id))
          .returning()) as [ImportRow];
      }
      await writeAudit(deps.db, actor, {
        action: 'import.extract',
        entity: 'document',
        entityId: doc.id,
        diff: {
          importId: result.id,
          status: result.status,
          errorCode: result.errorCode,
          model: result.model,
        },
      });
      return c.json(await dto(result), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/{id}',
      tags,
      request: { params: IdParamSchema },
      responses: { 200: json(ImportSchema), ...errors },
    }),
    async (c) => c.json(await dto(await load(c.req.valid('param').id, actorOf(c))), 200),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/confirm',
      tags,
      summary: 'Create the Pool 1 draft from reviewed values (every section must be confirmed)',
      request: {
        params: IdParamSchema,
        body: { content: { 'application/json': { schema: ImportConfirmSchema } }, required: true },
      },
      responses: { 201: json(DeveloperDetailSchema, 'Created'), ...errors },
    }),
    async (c) => {
      const actor = actorOf(c);
      const row = await load(c.req.valid('param').id, actor);
      const body = c.req.valid('json');
      if (row.status !== 'extracted')
        throw new AppError(409, 'CONFLICT', `Import is ${row.status}`);
      const missing = IMPORT_REVIEW_SECTIONS.filter((s) => !body.confirmedSections.includes(s));
      if (missing.length)
        throw new AppError(409, 'IMPORT_REVIEW_INCOMPLETE', 'Every section must be reviewed', {
          missing,
        });
      return c.json(await finish(row, body.developer, actor, 'reviewed'), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/manual',
      tags,
      summary: 'Manual fallback: empty Pool 1 draft with the CV attached',
      request: { params: IdParamSchema },
      responses: { 201: json(DeveloperDetailSchema, 'Created'), ...errors },
    }),
    async (c) => {
      const actor = actorOf(c);
      const row = await load(c.req.valid('param').id, actor);
      if (row.status === 'completed' || row.status === 'processing')
        throw new AppError(409, 'CONFLICT', `Import is ${row.status}`);
      return c.json(await finish(row, EMPTY_DRAFT, actor, 'manual'), 201);
    },
  );

  return app;
}
