import type { DocumentKind } from '@meridian/shared';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { documents, users } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { ValidatedFile } from '../../lib/files';
import { isoReq } from '../../lib/http';
import type { Actor, Deps } from '../../types';
import { writeAudit } from '../audit/audit.service';

/**
 * Scans and stores an uploaded file under a random key. Infected files are rejected
 * and never stored. Returns the document row.
 */
export async function storeDocument(
  deps: Deps,
  file: ValidatedFile,
  kind: DocumentKind,
  developerId: string | null,
  actor: Actor,
) {
  const scan = await deps.scanner.scan(file.bytes);
  if (scan === 'infected') {
    await writeAudit(deps.db, actor, {
      action: 'document.rejected_infected',
      entity: 'developer',
      entityId: developerId,
      diff: { kind },
    });
    throw new AppError(422, 'FILE_INFECTED', 'The file was rejected by the virus scanner');
  }
  const storageKey = `${developerId ? `developers/${developerId}` : 'imports'}/${randomUUID()}`;
  await deps.storage.put(storageKey, file.bytes, file.mime);
  try {
    const [doc] = await deps.db
      .insert(documents)
      .values({
        developerId,
        kind,
        storageKey,
        filename: file.filename,
        mime: file.mime,
        size: file.size,
        uploadedBy: actor.id,
        virusScanStatus: scan,
      })
      .returning();
    await writeAudit(deps.db, actor, {
      action: 'document.upload',
      entity: 'document',
      entityId: doc!.id,
      diff: { developerId, kind, mime: file.mime, size: file.size, scan },
    });
    return doc!;
  } catch (err) {
    await deps.storage.delete(storageKey).catch(() => {});
    throw err;
  }
}

export async function listDocuments(deps: Deps, developerId: string) {
  const rows = await deps.db
    .select({ d: documents, uploadedByName: users.displayName })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.uploadedBy))
    .where(eq(documents.developerId, developerId))
    .orderBy(desc(documents.createdAt));
  return rows.map(({ d, uploadedByName }) => ({
    id: d.id,
    kind: d.kind,
    filename: d.filename,
    mime: d.mime,
    size: d.size,
    virusScanStatus: d.virusScanStatus,
    uploadedByName,
    createdAt: isoReq(d.createdAt),
  }));
}

export async function getDocument(deps: Deps, developerId: string, docId: string) {
  const [doc] = await deps.db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.developerId, developerId)));
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found');
  return doc;
}

export async function deleteDocument(deps: Deps, developerId: string, docId: string, actor: Actor) {
  const doc = await getDocument(deps, developerId, docId);
  await deps.db.delete(documents).where(eq(documents.id, doc.id));
  await deps.storage
    .delete(doc.storageKey)
    .catch((err) => deps.logger.error('storage delete failed', { error: err, documentId: doc.id }));
  await writeAudit(deps.db, actor, {
    action: 'document.delete',
    entity: 'document',
    entityId: doc.id,
    diff: { developerId, kind: doc.kind },
  });
}
