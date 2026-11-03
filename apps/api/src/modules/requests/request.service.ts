import {
  rankDevelopers,
  type MatchDeveloper,
  type MatchEntry,
  type RequestDto,
  type RequestInput,
} from '@meridian/shared';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../db/client';
import {
  clients,
  developers,
  developerSkills,
  requestDevelopers,
  requests,
  requestSkills,
  skills,
  users,
} from '../../db/schema';
import { AppError } from '../../lib/errors';
import { isoReq } from '../../lib/http';
import type { Actor, Deps } from '../../types';
import { writeAudit } from '../audit/audit.service';

const devName = (d: { firstName: string | null; lastName: string | null }) =>
  [d.firstName, d.lastName].filter(Boolean).join(' ') || '–';

/** Loads requests with client, skills and proposals in a fixed number of queries (no N+1). */
export async function loadRequests(
  tx: Tx,
  filter: { id?: string; clientId?: string; status?: RequestDto['status'] } = {},
): Promise<RequestDto[]> {
  const rows = await tx
    .select({ r: requests, clientName: clients.name })
    .from(requests)
    .innerJoin(clients, eq(clients.id, requests.clientId))
    .where(
      and(
        isNull(requests.deletedAt),
        filter.id ? eq(requests.id, filter.id) : undefined,
        filter.clientId ? eq(requests.clientId, filter.clientId) : undefined,
        filter.status ? eq(requests.status, filter.status) : undefined,
      ),
    )
    .orderBy(desc(requests.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.r.id);
  const skillRows = await tx
    .select({
      requestId: requestSkills.requestId,
      skillId: skills.id,
      name: skills.name,
      minLevel: requestSkills.minLevel,
    })
    .from(requestSkills)
    .innerJoin(skills, eq(skills.id, requestSkills.skillId))
    .where(inArray(requestSkills.requestId, ids))
    .orderBy(desc(requestSkills.minLevel), asc(skills.name));
  const proposalRows = await tx
    .select({
      requestId: requestDevelopers.requestId,
      developerId: developers.id,
      publicRef: developers.publicRef,
      firstName: developers.firstName,
      lastName: developers.lastName,
      title: developers.title,
      status: requestDevelopers.status,
      proposedAt: requestDevelopers.proposedAt,
      proposedByName: users.displayName,
    })
    .from(requestDevelopers)
    .innerJoin(developers, eq(developers.id, requestDevelopers.developerId))
    .leftJoin(users, eq(users.id, requestDevelopers.proposedBy))
    .where(and(inArray(requestDevelopers.requestId, ids), isNull(developers.deletedAt)))
    .orderBy(asc(requestDevelopers.proposedAt));

  return rows.map(({ r, clientName }) => ({
    id: r.id,
    clientId: r.clientId,
    clientName,
    title: r.title,
    seniority: r.seniority,
    startBy: r.startBy,
    status: r.status,
    note: r.note,
    skills: skillRows.filter((s) => s.requestId === r.id).map(({ requestId: _r, ...s }) => s),
    proposals: proposalRows
      .filter((p) => p.requestId === r.id)
      .map((p) => ({
        developerId: p.developerId,
        publicRef: p.publicRef,
        name: devName(p),
        title: p.title,
        status: p.status,
        proposedByName: p.proposedByName,
        proposedAt: isoReq(p.proposedAt),
      })),
    createdAt: isoReq(r.createdAt),
    updatedAt: isoReq(r.updatedAt),
  }));
}

export async function getRequest(tx: Tx, id: string): Promise<RequestDto> {
  const [r] = await loadRequests(tx, { id });
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Request not found');
  return r;
}

async function assertClient(tx: Tx, clientId: string) {
  const [c] = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)));
  if (!c) throw new AppError(400, 'VALIDATION_FAILED', 'Unknown client', { clientId });
}

async function assertSkills(tx: Tx, ids: string[]) {
  const found = await tx.select({ id: skills.id }).from(skills).where(inArray(skills.id, ids));
  if (found.length !== new Set(ids).size)
    throw new AppError(400, 'VALIDATION_FAILED', 'Unknown skill');
}

export async function saveRequest(
  deps: Deps,
  input: RequestInput,
  actor: Actor,
  id?: string,
): Promise<RequestDto> {
  return deps.db.transaction(async (tx) => {
    await assertClient(tx, input.clientId);
    await assertSkills(
      tx,
      input.skills.map((s) => s.skillId),
    );
    const values = {
      clientId: input.clientId,
      title: input.title,
      seniority: input.seniority,
      startBy: input.startBy,
      status: input.status,
      note: input.note,
    };
    let requestId = id;
    if (id) {
      const before = await getRequest(tx, id);
      await tx.update(requests).set(values).where(eq(requests.id, id));
      await tx.delete(requestSkills).where(eq(requestSkills.requestId, id));
      await writeAudit(tx, actor, {
        action: 'request.update',
        entity: 'request',
        entityId: id,
        diff: {
          before: { ...values, skills: before.skills },
          after: { ...values, skills: input.skills },
        },
      });
    } else {
      const [row] = await tx
        .insert(requests)
        .values({ ...values, createdBy: actor.id })
        .returning({ id: requests.id });
      requestId = row!.id;
      await writeAudit(tx, actor, {
        action: 'request.create',
        entity: 'request',
        entityId: requestId,
        diff: { ...values, skills: input.skills },
      });
    }
    await tx.insert(requestSkills).values(
      input.skills.map((s) => ({
        requestId: requestId!,
        skillId: s.skillId,
        minLevel: s.minLevel,
      })),
    );
    return getRequest(tx, requestId!);
  });
}

/** Ranks all approved (Pool 2), unrestricted developers against a request. */
export async function matchRequest(tx: Tx, id: string): Promise<MatchEntry[]> {
  const req = await getRequest(tx, id);
  const reqSkillRows = await tx
    .select({
      skillId: skills.id,
      name: skills.name,
      aliases: skills.aliases,
      minLevel: requestSkills.minLevel,
    })
    .from(requestSkills)
    .innerJoin(skills, eq(skills.id, requestSkills.skillId))
    .where(eq(requestSkills.requestId, id));

  const devRows = await tx
    .select()
    .from(developers)
    .where(
      and(
        eq(developers.status, 'P2_FREIGEGEBEN'),
        isNull(developers.deletedAt),
        eq(developers.processingRestricted, false),
      ),
    );
  if (!devRows.length) return [];
  const skillRows = await tx
    .select({
      developerId: developerSkills.developerId,
      skillId: skills.id,
      name: skills.name,
      aliases: skills.aliases,
      level: developerSkills.level,
    })
    .from(developerSkills)
    .innerJoin(skills, eq(skills.id, developerSkills.skillId))
    .where(
      inArray(
        developerSkills.developerId,
        devRows.map((d) => d.id),
      ),
    );

  const bySkills = new Map<string, MatchDeveloper['skills'][number][]>();
  for (const s of skillRows) {
    const list = bySkills.get(s.developerId) ?? [];
    list.push({ skillId: s.skillId, name: s.name, aliases: s.aliases, level: s.level });
    bySkills.set(s.developerId, list);
  }
  const ranked = rankDevelopers(
    devRows.map((d) => ({
      id: d.id,
      status: d.status,
      seniority: d.seniority,
      availableFrom: d.availableFrom,
      skills: bySkills.get(d.id) ?? [],
    })),
    { seniority: req.seniority, startBy: req.startBy, skills: reqSkillRows },
  );
  const byId = new Map(devRows.map((d) => [d.id, d]));
  const proposed = new Set(req.proposals.map((p) => p.developerId));
  return ranked.map((r) => {
    const d = byId.get(r.developerId)!;
    return {
      ...r,
      publicRef: d.publicRef,
      name: devName(d),
      title: d.title,
      seniority: d.seniority,
      availableFrom: d.availableFrom,
      isPlaced: d.isPlaced,
      proposed: proposed.has(d.id),
    };
  });
}

export async function propose(deps: Deps, requestId: string, developerId: string, actor: Actor) {
  return deps.db.transaction(async (tx) => {
    const req = await getRequest(tx, requestId);
    const [dev] = await tx
      .select()
      .from(developers)
      .where(and(eq(developers.id, developerId), isNull(developers.deletedAt)))
      .for('update');
    if (!dev) throw new AppError(404, 'NOT_FOUND', 'Developer not found');
    // Only Pool 2 is client-ready (rule 1 of the two-phase process).
    if (dev.status !== 'P2_FREIGEGEBEN')
      throw new AppError(
        409,
        'NOT_CLIENT_READY',
        'Only approved (Pool 2) profiles can be proposed',
      );
    if (dev.processingRestricted)
      throw new AppError(403, 'PROCESSING_RESTRICTED', 'Processing of this profile is restricted');
    const inserted = await tx
      .insert(requestDevelopers)
      .values({ requestId, developerId, proposedBy: actor.id })
      .onConflictDoNothing()
      .returning({ developerId: requestDevelopers.developerId });
    if (inserted.length) {
      await writeAudit(tx, actor, {
        action: 'request.proposal.add',
        entity: 'request',
        entityId: requestId,
        diff: { developerId },
      });
      if (req.status === 'open') {
        await tx.update(requests).set({ status: 'proposed' }).where(eq(requests.id, requestId));
        await writeAudit(tx, actor, {
          action: 'request.status',
          entity: 'request',
          entityId: requestId,
          diff: { from: 'open', to: 'proposed', auto: true },
        });
      }
    }
    return getRequest(tx, requestId);
  });
}

export async function unpropose(deps: Deps, requestId: string, developerId: string, actor: Actor) {
  return deps.db.transaction(async (tx) => {
    await getRequest(tx, requestId);
    const removed = await tx
      .delete(requestDevelopers)
      .where(
        and(
          eq(requestDevelopers.requestId, requestId),
          eq(requestDevelopers.developerId, developerId),
        ),
      )
      .returning();
    if (!removed.length) throw new AppError(404, 'NOT_FOUND', 'Proposal not found');
    await writeAudit(tx, actor, {
      action: 'request.proposal.remove',
      entity: 'request',
      entityId: requestId,
      diff: { developerId, reason: 'manual' },
    });
    return getRequest(tx, requestId);
  });
}

export { sql };
