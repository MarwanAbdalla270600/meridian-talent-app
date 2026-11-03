import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import {
  auditLog,
  clients,
  cvImports,
  developers,
  documents,
  requestDevelopers,
  requests,
  statusHistory,
  users,
} from '../../db/schema';
import { AppError } from '../../lib/errors';
import { iso, isoReq } from '../../lib/http';
import { brand, documentShell, escapeHtml as e } from '../../templates/brand';
import { refOf } from '../../templates/profile.template';
import type { Actor, Deps } from '../../types';
import { writeAudit } from '../audit/audit.service';
import { loadAggregate, snapshot, toMonth } from '../developers/developer.repository';

async function anyDeveloper(deps: Deps, id: string) {
  // Includes soft-deleted profiles: GDPR rights apply to them as well.
  const [d] = await deps.db.select().from(developers).where(eq(developers.id, id));
  if (!d) throw new AppError(404, 'NOT_FOUND', 'Developer not found');
  return d;
}

/** Art. 15 data access: everything stored about the candidate. */
export async function exportDeveloperData(deps: Deps, id: string, actor: Actor) {
  const dev = await anyDeveloper(deps, id);
  const agg = await loadAggregate(deps.db, dev);
  const docs = await deps.db
    .select({
      filename: documents.filename,
      kind: documents.kind,
      mime: documents.mime,
      size: documents.size,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.developerId, id));
  const history = await deps.db
    .select({
      from: statusHistory.fromStatus,
      to: statusHistory.toStatus,
      note: statusHistory.note,
      at: statusHistory.createdAt,
      by: users.displayName,
    })
    .from(statusHistory)
    .leftJoin(users, eq(users.id, statusHistory.actorId))
    .where(eq(statusHistory.developerId, id))
    .orderBy(statusHistory.createdAt);
  const proposals = await deps.db
    .select({
      request: requests.title,
      client: clients.name,
      status: requestDevelopers.status,
      at: requestDevelopers.proposedAt,
    })
    .from(requestDevelopers)
    .innerJoin(requests, eq(requests.id, requestDevelopers.requestId))
    .innerJoin(clients, eq(clients.id, requests.clientId))
    .where(eq(requestDevelopers.developerId, id));
  const activity = await deps.db
    .select({ action: auditLog.action, at: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.entity, 'developer'), eq(auditLog.entityId, id)))
    .orderBy(desc(auditLog.createdAt))
    .limit(500);

  await writeAudit(deps.db, actor, { action: 'gdpr.export', entity: 'developer', entityId: id });
  return {
    generatedAt: deps.now().toISOString(),
    controller: brand.name,
    reference: refOf(dev.publicRef),
    profile: {
      ...snapshot(agg),
      status: dev.status,
      isPlaced: dev.isPlaced,
      reviewNote: dev.reviewNote,
      processingRestricted: dev.processingRestricted,
      restrictionReason: dev.restrictionReason,
      createdAt: isoReq(dev.createdAt),
      updatedAt: isoReq(dev.updatedAt),
      approvedAt: iso(dev.approvedAt),
      deletedAt: iso(dev.deletedAt),
    },
    documents: docs.map((d) => ({ ...d, createdAt: isoReq(d.createdAt) })),
    statusHistory: history.map((h) => ({ ...h, at: isoReq(h.at) })),
    proposals: proposals.map((p) => ({ ...p, at: isoReq(p.at) })),
    processingActivities: activity.map((a) => ({ ...a, at: isoReq(a.at) })),
  };
}

/** Renders the data export as a readable PDF document (HTML → Chromium). */
export function exportHtml(data: Awaited<ReturnType<typeof exportDeveloperData>>): string {
  const section = (title: string, value: unknown) => {
    if (Array.isArray(value)) {
      if (!value.length) return `<h2>${e(title)}</h2><p>–</p>`;
      const keys = Object.keys(value[0] as object);
      return `<h2>${e(title)}</h2><table><tr>${keys.map((k) => `<th>${e(k)}</th>`).join('')}</tr>${value
        .map(
          (row) =>
            `<tr>${keys.map((k) => `<td>${e(fmt((row as Record<string, unknown>)[k]))}</td>`).join('')}</tr>`,
        )
        .join('')}</table>`;
    }
    return `<h2>${e(title)}</h2><table>${Object.entries(value as object)
      .map(([k, v]) => `<tr><th>${e(k)}</th><td>${e(fmt(v))}</td></tr>`)
      .join('')}</table>`;
  };
  const fmt = (v: unknown): string =>
    v === null || v === undefined
      ? '–'
      : typeof v === 'object'
        ? JSON.stringify(v, null, 1)
        : String(v);
  const css = `h1{font-size:16pt;margin-bottom:4px}h2{font-size:11pt;margin:16px 0 6px;color:${brand.primaryDarkColor}}
table{width:100%;border-collapse:collapse;font-size:8.5pt}th,td{border:1px solid #e2e7f0;padding:3px 5px;text-align:left;vertical-align:top;white-space:pre-wrap;word-break:break-word}th{background:#f3f6fc;width:22%}`;
  const body = `<h1>Datenauskunft (Art. 15 DSGVO) · Data access report</h1>
<p>${e(data.controller)} · Kennung/Ref. ${e(data.reference)} · ${e(data.generatedAt)}</p>
${section('Profil / Profile', data.profile)}${section('Dokumente / Documents', data.documents)}
${section('Statusverlauf / Status history', data.statusHistory)}${section('Vorschläge / Proposals', data.proposals)}
${section('Verarbeitungen / Processing activities', data.processingActivities)}`;
  return documentShell('de', 'Datenauskunft', css, body, {
    left: `${brand.name} · Vertraulich`,
    right: data.generatedAt.slice(0, 10),
  });
}

/**
 * Art. 17 erasure: deletes stored files and the profile (cascades to skills, experiences,
 * documents, history and proposals) and redacts audit payloads that may contain personal data.
 */
export async function eraseDeveloper(deps: Deps, id: string, confirm: string, actor: Actor) {
  const dev = await anyDeveloper(deps, id);
  if (confirm !== `#${refOf(dev.publicRef)}`)
    throw new AppError(400, 'BAD_REQUEST', 'Confirmation does not match the reference');
  const docs = await deps.db
    .select({ id: documents.id, key: documents.storageKey })
    .from(documents)
    .where(eq(documents.developerId, id));
  const importDocs = await deps.db
    .select({ id: documents.id, key: documents.storageKey })
    .from(cvImports)
    .innerJoin(documents, eq(documents.id, cvImports.documentId))
    .where(eq(cvImports.developerId, id));
  const allDocs = [...docs, ...importDocs.filter((d) => !docs.some((x) => x.id === d.id))];

  for (const d of allDocs) {
    await deps.storage.delete(d.key);
  }
  await deps.db.transaction(async (tx) => {
    const docIds = allDocs.map((d) => d.id);
    if (docIds.length) await tx.delete(documents).where(inArray(documents.id, docIds));
    await tx.delete(developers).where(eq(developers.id, id));
    // Append-only audit log: the trigger permits exactly this redaction of the payload.
    await tx
      .update(auditLog)
      .set({ diff: { redacted: true } })
      .where(
        and(
          sql`${auditLog.diff} is distinct from '{"redacted": true}'::jsonb`,
          or(
            and(eq(auditLog.entity, 'developer'), eq(auditLog.entityId, id)),
            docIds.length
              ? and(eq(auditLog.entity, 'document'), inArray(auditLog.entityId, docIds))
              : sql`false`,
            sql`${auditLog.diff} ->> 'developerId' = ${id}`,
          ),
        ),
      );
    await writeAudit(tx, actor, {
      action: 'gdpr.erase',
      entity: 'developer',
      entityId: id,
      diff: { documents: allDocs.length },
    });
  });
}

export async function setRestriction(
  deps: Deps,
  id: string,
  restricted: boolean,
  reason: string | undefined,
  actor: Actor,
) {
  const dev = await anyDeveloper(deps, id);
  if (restricted && !reason?.trim())
    throw new AppError(400, 'NOTE_REQUIRED', 'A reason is required');
  await deps.db.transaction(async (tx) => {
    await tx
      .update(developers)
      .set({
        processingRestricted: restricted,
        restrictedAt: restricted ? deps.now() : null,
        restrictionReason: restricted ? reason!.trim() : null,
      })
      .where(eq(developers.id, id));
    if (restricted) {
      const removed = await tx
        .delete(requestDevelopers)
        .where(eq(requestDevelopers.developerId, id))
        .returning({ requestId: requestDevelopers.requestId });
      for (const r of removed) {
        await writeAudit(tx, actor, {
          action: 'request.proposal.remove',
          entity: 'request',
          entityId: r.requestId,
          diff: { developerId: id, reason: 'restricted' },
        });
      }
    }
    await writeAudit(tx, actor, {
      action: restricted ? 'gdpr.restrict' : 'gdpr.lift_restriction',
      entity: 'developer',
      entityId: id,
    });
  });
  return dev;
}

export async function unflag(deps: Deps, id: string, actor: Actor) {
  await anyDeveloper(deps, id);
  await deps.db
    .update(developers)
    .set({ deletionFlaggedAt: null, deletionFlagReason: null })
    .where(eq(developers.id, id));
  await writeAudit(deps.db, actor, { action: 'gdpr.unflag', entity: 'developer', entityId: id });
}

export { toMonth };
