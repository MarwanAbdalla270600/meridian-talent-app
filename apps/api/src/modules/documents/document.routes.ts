import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { DOCUMENT_KINDS, DocumentSchema, DownloadUrlSchema, OkSchema } from '@meridian/shared';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { MIME, validateUpload } from '../../lib/files';
import { errors, json } from '../../lib/http';
import { RATE_LIMITS } from '../../lib/rate-limit';
import { actorOf, assertCan, requireAuth } from '../../middleware/auth';
import { validationHook } from '../../middleware/error-handler';
import { rateLimit } from '../../middleware/rate-limit';
import type { AppEnv, Deps } from '../../types';
import { writeAudit } from '../audit/audit.service';
import { policyCtx, requireDeveloper } from '../developers/developer.service';
import * as docs from './document.service';

const tags = ['documents'];
const DevParam = z.object({ id: z.uuid() });
const DocParam = z.object({ id: z.uuid(), docId: z.uuid() });
const UploadForm = z.object({
  file: z.any().describe('PDF, DOCX, PNG or JPEG'),
  kind: z.enum(DOCUMENT_KINDS).default('other'),
});

export function documentRoutes(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  app.use('*', requireAuth);

  app.openapi(
    createRoute({
      method: 'get',
      path: '/{id}/documents',
      tags,
      request: { params: DevParam },
      responses: { 200: json(z.array(DocumentSchema)), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const dev = await requireDeveloper(deps.db, id);
      assertCan(actorOf(c), 'document:read', policyCtx(dev));
      return c.json(await docs.listDocuments(deps, id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/documents',
      tags,
      summary: 'Upload a document (CV, consent proof, other)',
      middleware: [rateLimit(deps, 'upload', RATE_LIMITS.upload, 'user')] as const,
      request: {
        params: DevParam,
        body: { content: { 'multipart/form-data': { schema: UploadForm } }, required: true },
      },
      responses: { 201: json(DocumentSchema, 'Created'), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const actor = actorOf(c);
      const dev = await requireDeveloper(deps.db, id);
      assertCan(actor, 'document:upload', policyCtx(dev));
      const form = await c.req.formData();
      const kindRaw = form.get('kind') ?? 'other';
      const kind = z.enum(DOCUMENT_KINDS).safeParse(kindRaw);
      if (!kind.success) throw new AppError(400, 'VALIDATION_FAILED', 'Invalid kind');
      const allowed =
        kind.data === 'cv' ? [MIME.pdf, MIME.docx] : [MIME.pdf, MIME.docx, MIME.png, MIME.jpeg];
      const file = await validateUpload(
        form.get('file'),
        deps.env.MAX_UPLOAD_MB * 1024 * 1024,
        allowed,
      );
      const doc = await docs.storeDocument(deps, file, kind.data, id, actor);
      const [dto] = (await docs.listDocuments(deps, id)).filter((d) => d.id === doc.id);
      return c.json(dto!, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/{id}/documents/{docId}/download',
      tags,
      summary: 'Short-lived pre-signed download URL',
      request: { params: DocParam },
      responses: { 200: json(DownloadUrlSchema), ...errors },
    }),
    async (c) => {
      const { id, docId } = c.req.valid('param');
      const actor = actorOf(c);
      const dev = await requireDeveloper(deps.db, id);
      assertCan(actor, 'document:read', policyCtx(dev));
      const doc = await docs.getDocument(deps, id, docId);
      if (doc.virusScanStatus === 'infected')
        throw new AppError(403, 'FILE_INFECTED', 'File is quarantined');
      const url = await deps.storage.presignGet(doc.storageKey, doc.filename, doc.mime);
      await writeAudit(deps.db, actor, {
        action: 'document.download',
        entity: 'document',
        entityId: doc.id,
        diff: { developerId: id },
      });
      return c.json({ url, expiresInSeconds: deps.env.S3_PRESIGN_SECONDS }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}/documents/{docId}',
      tags,
      request: { params: DocParam },
      responses: { 200: json(OkSchema), ...errors },
    }),
    async (c) => {
      const { id, docId } = c.req.valid('param');
      const actor = actorOf(c);
      const dev = await requireDeveloper(deps.db, id);
      assertCan(actor, 'document:delete', policyCtx(dev));
      await docs.deleteDocument(deps, id, docId, actor);
      return c.json({ ok: true as const }, 200);
    },
  );

  return app;
}
