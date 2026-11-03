import {
  can,
  CHECKLIST_GATED_EVENTS,
  CRITICAL_FIELDS,
  EVENT_ACTION,
  nextStatus,
  NOTE_REQUIRED_EVENTS,
  type DeveloperCreateInput,
  type DeveloperStatus,
  type DeveloperUpdateInput,
  type TransitionInput,
} from '@meridian/shared';
import { eq, sql } from 'drizzle-orm';
import type { Tx } from '../../db/client';
import {
  certifications,
  developerLanguages,
  developers,
  developerSkills,
  experiences,
  requestDevelopers,
  statusHistory,
} from '../../db/schema';
import { AppError } from '../../lib/errors';
import { assertCan } from '../../middleware/auth';
import type { Actor, Deps } from '../../types';
import { diffObjects, writeAudit } from '../audit/audit.service';
import { getSettings } from '../settings/settings.service';
import { resolveSkills } from '../skills/skill.service';
import {
  checklistOf,
  findDeveloper,
  fromMonth,
  loadAggregate,
  snapshot,
  type DeveloperAggregate,
  type DeveloperRow,
} from './developer.repository';

const policyCtx = (d: DeveloperRow) => ({
  status: d.status,
  processingRestricted: d.processingRestricted,
});

function baseValues(input: DeveloperCreateInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    title: input.title,
    seniority: input.seniority,
    location: input.location,
    availableFrom: input.availableFrom,
    currency: input.currency,
    isPlaced: input.isPlaced,
    summaryDe: input.summaryDe,
    summaryEn: input.summaryEn,
    educationDe: input.educationDe,
    educationEn: input.educationEn,
    internalNote: input.internalNote,
    consentGiven: input.consentGiven,
    consentAt: input.consentAt,
    consentVersion: input.consentVersion,
  };
}

async function writeChildren(
  tx: Tx,
  developerId: string,
  input: DeveloperCreateInput,
  actor: Actor,
) {
  await tx.delete(developerSkills).where(eq(developerSkills.developerId, developerId));
  await tx.delete(experiences).where(eq(experiences.developerId, developerId));
  await tx.delete(certifications).where(eq(certifications.developerId, developerId));
  await tx.delete(developerLanguages).where(eq(developerLanguages.developerId, developerId));

  const resolved = await resolveSkills(tx, input.skills, actor);
  if (resolved.length)
    await tx.insert(developerSkills).values(resolved.map((s) => ({ ...s, developerId })));
  if (input.experiences.length) {
    await tx.insert(experiences).values(
      input.experiences.map((e, i) => ({
        developerId,
        role: e.role,
        company: e.company,
        fromDate: fromMonth(e.fromDate),
        toDate: e.toDate ? fromMonth(e.toDate) : null,
        descriptionDe: e.descriptionDe,
        descriptionEn: e.descriptionEn,
        sortOrder: i,
      })),
    );
  }
  if (input.certifications.length) {
    await tx
      .insert(certifications)
      .values(input.certifications.map((c) => ({ ...c, developerId })));
  }
  const langs = new Map(input.languages.map((l) => [l.language, l.level]));
  if (langs.size) {
    await tx
      .insert(developerLanguages)
      .values([...langs].map(([language, level]) => ({ developerId, language, level })));
  }
}

export async function createDeveloper(
  deps: Deps,
  input: DeveloperCreateInput,
  actor: Actor,
): Promise<DeveloperAggregate> {
  assertCan(actor, 'developer:create');
  return deps.db.transaction(async (tx) => {
    const [dev] = await tx
      .insert(developers)
      .values({
        ...baseValues(input),
        hourlyRateCents: can(actor.role, 'developer:editRate')
          ? (input.hourlyRateCents ?? null)
          : null,
        status: 'P1_IN_ERFASSUNG',
        createdBy: actor.id,
      })
      .returning();
    await writeChildren(tx, dev!.id, input, actor);
    await tx.insert(statusHistory).values({
      developerId: dev!.id,
      fromStatus: null,
      toStatus: 'P1_IN_ERFASSUNG',
      actorId: actor.id,
    });
    const agg = await loadAggregate(tx, dev!);
    await writeAudit(tx, actor, {
      action: 'developer.create',
      entity: 'developer',
      entityId: dev!.id,
      diff: diffObjects({}, snapshot(agg)),
    });
    return agg;
  });
}

export async function updateDeveloper(
  deps: Deps,
  id: string,
  input: DeveloperUpdateInput,
  actor: Actor,
): Promise<DeveloperAggregate> {
  return deps.db.transaction(async (tx) => {
    const current = await findDeveloper(tx, id, true);
    if (!current) throw new AppError(404, 'NOT_FOUND', 'Developer not found');
    assertCan(actor, 'developer:update', policyCtx(current));
    if (current.version !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', 'The profile was changed by someone else', {
        currentVersion: current.version,
      });
    }
    const before = snapshot(await loadAggregate(tx, current));

    // Roles without rate permission can neither see nor change the rate.
    const hourlyRateCents = can(actor.role, 'developer:editRate')
      ? input.hourlyRateCents === undefined
        ? current.hourlyRateCents
        : input.hourlyRateCents
      : current.hourlyRateCents;

    const [updated] = await tx
      .update(developers)
      .set({ ...baseValues(input), hourlyRateCents, version: current.version + 1 })
      .where(eq(developers.id, id))
      .returning();
    await writeChildren(tx, id, input, actor);
    let agg = await loadAggregate(tx, updated!);
    const diff = diffObjects(before, snapshot(agg));
    await writeAudit(tx, actor, {
      action: 'developer.update',
      entity: 'developer',
      entityId: id,
      diff,
    });

    // Optional: changes to critical fields of an approved profile reset the approval.
    if (current.status === 'P2_FREIGEGEBEN') {
      const settings = await getSettings(tx, deps.env);
      const critical = CRITICAL_FIELDS.filter((f) => f in diff);
      if (settings.resetApprovalOnCriticalChange && critical.length) {
        const note = `auto: critical fields changed (${critical.join(', ')})`;
        const [reset] = await tx
          .update(developers)
          .set({ status: 'P1_IN_ERFASSUNG', approvedAt: null, approvedBy: null, reviewNote: note })
          .where(eq(developers.id, id))
          .returning();
        await tx.insert(statusHistory).values({
          developerId: id,
          fromStatus: 'P2_FREIGEGEBEN',
          toStatus: 'P1_IN_ERFASSUNG',
          actorId: actor.id,
          note,
        });
        await removeProposals(tx, id, actor, 'approval_reset');
        await writeAudit(tx, actor, {
          action: 'developer.status',
          entity: 'developer',
          entityId: id,
          diff: { from: 'P2_FREIGEGEBEN', to: 'P1_IN_ERFASSUNG', event: 'auto_reset', note },
        });
        agg = { ...agg, dev: reset! };
      }
    }
    return agg;
  });
}

async function removeProposals(tx: Tx, developerId: string, actor: Actor, reason: string) {
  const removed = await tx
    .delete(requestDevelopers)
    .where(eq(requestDevelopers.developerId, developerId))
    .returning({ requestId: requestDevelopers.requestId });
  for (const r of removed) {
    await writeAudit(tx, actor, {
      action: 'request.proposal.remove',
      entity: 'request',
      entityId: r.requestId,
      diff: { developerId, reason },
    });
  }
  return removed.length;
}

/** Applies a workflow event; every rule of the two-phase process is enforced here. */
export async function transitionDeveloper(
  deps: Deps,
  id: string,
  input: TransitionInput,
  actor: Actor,
): Promise<DeveloperAggregate> {
  return deps.db.transaction(async (tx) => {
    const dev = await findDeveloper(tx, id, true);
    if (!dev) throw new AppError(404, 'NOT_FOUND', 'Developer not found');
    const action = EVENT_ACTION[input.event];
    if (!can(actor.role, action)) throw new AppError(403, 'FORBIDDEN', 'Not allowed');

    const to = nextStatus(dev.status, input.event);
    if (!to) {
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        `Event "${input.event}" is not possible in status ${dev.status}`,
        {
          from: dev.status,
          event: input.event,
        },
      );
    }
    assertCan(actor, action, policyCtx(dev));

    const note = input.note?.trim() || null;
    if (NOTE_REQUIRED_EVENTS.includes(input.event) && !note) {
      throw new AppError(400, 'NOTE_REQUIRED', 'A note is required');
    }
    if (CHECKLIST_GATED_EVENTS.includes(input.event)) {
      const missing = checklistOf(await loadAggregate(tx, dev))
        .filter((i) => !i.ok)
        .map((i) => i.key);
      if (missing.length)
        throw new AppError(409, 'CHECKLIST_INCOMPLETE', 'Checklist incomplete', { missing });
    }

    const now = deps.now();
    const patch: Partial<typeof developers.$inferInsert> & { status: DeveloperStatus } = {
      status: to,
      version: dev.version + 1,
    };
    if (input.event === 'approve')
      Object.assign(patch, { approvedBy: actor.id, approvedAt: now, reviewNote: null });
    if (input.event === 'return') patch.reviewNote = note;
    if (input.event === 'submit') patch.reviewNote = null;
    if (input.event === 'demote')
      Object.assign(patch, { approvedBy: null, approvedAt: null, reviewNote: note });

    const [updated] = await tx
      .update(developers)
      .set(patch)
      .where(eq(developers.id, id))
      .returning();
    await tx
      .insert(statusHistory)
      .values({ developerId: id, fromStatus: dev.status, toStatus: to, actorId: actor.id, note });
    const removed = input.event === 'demote' ? await removeProposals(tx, id, actor, 'demoted') : 0;
    await writeAudit(tx, actor, {
      action: 'developer.status',
      entity: 'developer',
      entityId: id,
      diff: {
        from: dev.status,
        to,
        event: input.event,
        note,
        ...(removed ? { proposalsRemoved: removed } : {}),
      },
    });
    return loadAggregate(tx, updated!);
  });
}

export async function softDeleteDeveloper(deps: Deps, id: string, actor: Actor) {
  assertCan(actor, 'developer:delete');
  await deps.db.transaction(async (tx) => {
    const dev = await findDeveloper(tx, id, true);
    if (!dev) throw new AppError(404, 'NOT_FOUND', 'Developer not found');
    await tx.update(developers).set({ deletedAt: deps.now() }).where(eq(developers.id, id));
    await removeProposals(tx, id, actor, 'deleted');
    await writeAudit(tx, actor, { action: 'developer.delete', entity: 'developer', entityId: id });
  });
}

/** Loads a developer for read access (any authenticated role with developer:read). */
export async function getDeveloper(deps: Deps, id: string, actor: Actor) {
  assertCan(actor, 'developer:read');
  const dev = await findDeveloper(deps.db, id);
  if (!dev) throw new AppError(404, 'NOT_FOUND', 'Developer not found');
  return loadAggregate(deps.db, dev);
}

export async function requireDeveloper(tx: Tx, id: string) {
  const dev = await findDeveloper(tx, id);
  if (!dev) throw new AppError(404, 'NOT_FOUND', 'Developer not found');
  return dev;
}

export { policyCtx, sql };
