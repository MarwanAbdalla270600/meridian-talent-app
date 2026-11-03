import {
  availableEvents,
  can,
  EVENT_ACTION,
  evaluateChecklist,
  POOL_STATUSES,
  type DeveloperDetail,
  type DeveloperListItem,
  type DeveloperListQuerySchema,
  type Paginated,
} from '@meridian/shared';
import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { z } from 'zod';
import type { Tx } from '../../db/client';
import {
  certifications,
  developerLanguages,
  developers,
  developerSkills,
  experiences,
  skills,
  statusHistory,
  users,
} from '../../db/schema';
import { iso, isoReq } from '../../lib/http';
import type { Actor } from '../../types';

export type DeveloperRow = typeof developers.$inferSelect;

export interface DeveloperAggregate {
  dev: DeveloperRow;
  skills: {
    skillId: string;
    name: string;
    category: DeveloperDetail['skills'][number]['category'];
    skillStatus: 'approved' | 'pending';
    level: number;
    years: number;
    aliases: string[];
  }[];
  experiences: (typeof experiences.$inferSelect)[];
  certifications: (typeof certifications.$inferSelect)[];
  languages: (typeof developerLanguages.$inferSelect)[];
}

/** `YYYY-MM-01` (DB) → `YYYY-MM` (API). */
export const toMonth = (d: string | null) => (d ? d.slice(0, 7) : null);
/** `YYYY-MM` (API) → `YYYY-MM-01` (DB). */
export const fromMonth = (m: string) => `${m}-01`;

export async function findDeveloper(
  tx: Tx,
  id: string,
  forUpdate = false,
): Promise<DeveloperRow | undefined> {
  const q = tx
    .select()
    .from(developers)
    .where(and(eq(developers.id, id), isNull(developers.deletedAt)));
  const [row] = forUpdate ? await q.for('update') : await q;
  return row;
}

export async function loadAggregate(tx: Tx, dev: DeveloperRow): Promise<DeveloperAggregate> {
  const skillRows = await tx
    .select({
      skillId: skills.id,
      name: skills.name,
      category: skills.category,
      skillStatus: skills.status,
      aliases: skills.aliases,
      level: developerSkills.level,
      years: developerSkills.years,
    })
    .from(developerSkills)
    .innerJoin(skills, eq(skills.id, developerSkills.skillId))
    .where(eq(developerSkills.developerId, dev.id))
    .orderBy(desc(developerSkills.level), asc(skills.name));
  const exps = await tx
    .select()
    .from(experiences)
    .where(eq(experiences.developerId, dev.id))
    .orderBy(desc(experiences.fromDate), asc(experiences.sortOrder));
  const certs = await tx
    .select()
    .from(certifications)
    .where(eq(certifications.developerId, dev.id))
    .orderBy(desc(certifications.year), asc(certifications.name));
  const langs = await tx
    .select()
    .from(developerLanguages)
    .where(eq(developerLanguages.developerId, dev.id))
    .orderBy(asc(developerLanguages.language));
  return { dev, skills: skillRows, experiences: exps, certifications: certs, languages: langs };
}

export function checklistOf(a: DeveloperAggregate) {
  return evaluateChecklist({
    firstName: a.dev.firstName,
    lastName: a.dev.lastName,
    title: a.dev.title,
    summaryDe: a.dev.summaryDe,
    summaryEn: a.dev.summaryEn,
    consentGiven: a.dev.consentGiven,
    consentAt: a.dev.consentAt,
    consentVersion: a.dev.consentVersion,
    skillCount: a.skills.length,
    experienceCount: a.experiences.length,
    languageCount: a.languages.length,
  });
}

/** Comparable snapshot of the editable content (used for audit diffs). */
export function snapshot(a: DeveloperAggregate): Record<string, unknown> {
  const d = a.dev;
  return {
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email,
    phone: d.phone,
    title: d.title,
    seniority: d.seniority,
    location: d.location,
    availableFrom: d.availableFrom,
    hourlyRateCents: d.hourlyRateCents,
    currency: d.currency,
    isPlaced: d.isPlaced,
    summaryDe: d.summaryDe,
    summaryEn: d.summaryEn,
    educationDe: d.educationDe,
    educationEn: d.educationEn,
    internalNote: d.internalNote,
    consentGiven: d.consentGiven,
    consentAt: d.consentAt,
    consentVersion: d.consentVersion,
    skills: a.skills
      .map((s) => ({ name: s.name, level: s.level, years: s.years }))
      .sort((x, y) => x.name.localeCompare(y.name)),
    experiences: a.experiences.map((e) => ({
      role: e.role,
      company: e.company,
      fromDate: toMonth(e.fromDate),
      toDate: toMonth(e.toDate),
      descriptionDe: e.descriptionDe,
      descriptionEn: e.descriptionEn,
    })),
    certifications: a.certifications.map((c) => ({ name: c.name, issuer: c.issuer, year: c.year })),
    languages: a.languages.map((l) => ({ language: l.language, level: l.level })),
  };
}

export async function toDetail(
  tx: Tx,
  a: DeveloperAggregate,
  actor: Actor,
): Promise<DeveloperDetail> {
  const d = a.dev;
  const approver = aliasedTable(users, 'approver');
  const history = await tx
    .select({
      id: statusHistory.id,
      fromStatus: statusHistory.fromStatus,
      toStatus: statusHistory.toStatus,
      note: statusHistory.note,
      createdAt: statusHistory.createdAt,
      actorName: users.displayName,
      actorRole: users.role,
    })
    .from(statusHistory)
    .leftJoin(users, eq(users.id, statusHistory.actorId))
    .where(eq(statusHistory.developerId, d.id))
    .orderBy(desc(statusHistory.createdAt));
  const [appr] = d.approvedBy
    ? await tx
        .select({ name: approver.displayName })
        .from(approver)
        .where(eq(approver.id, d.approvedBy))
    : [];
  const ctx = { status: d.status, processingRestricted: d.processingRestricted };
  const showRate = can(actor.role, 'developer:viewRate');
  return {
    id: d.id,
    publicRef: d.publicRef,
    version: d.version,
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email,
    phone: d.phone,
    title: d.title,
    seniority: d.seniority,
    location: d.location,
    availableFrom: d.availableFrom,
    ...(showRate ? { hourlyRateCents: d.hourlyRateCents } : {}),
    currency: d.currency,
    status: d.status,
    isPlaced: d.isPlaced,
    summaryDe: d.summaryDe,
    summaryEn: d.summaryEn,
    educationDe: d.educationDe,
    educationEn: d.educationEn,
    internalNote: d.internalNote,
    reviewNote: d.reviewNote,
    consentGiven: d.consentGiven,
    consentAt: d.consentAt,
    consentVersion: d.consentVersion,
    processingRestricted: d.processingRestricted,
    restrictionReason: d.restrictionReason,
    deletionFlaggedAt: iso(d.deletionFlaggedAt),
    deletionFlagReason: d.deletionFlagReason,
    approvedAt: iso(d.approvedAt),
    approvedByName: appr?.name ?? null,
    createdAt: isoReq(d.createdAt),
    updatedAt: isoReq(d.updatedAt),
    skills: a.skills.map(({ aliases: _a, ...s }) => s),
    experiences: a.experiences.map((e) => ({
      id: e.id,
      role: e.role,
      company: e.company,
      fromDate: toMonth(e.fromDate)!,
      toDate: toMonth(e.toDate),
      descriptionDe: e.descriptionDe,
      descriptionEn: e.descriptionEn,
    })),
    certifications: a.certifications.map((c) => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      year: c.year,
    })),
    languages: a.languages.map((l) => ({ language: l.language, level: l.level })),
    checklist: checklistOf(a),
    history: history.map((h) => ({ ...h, createdAt: isoReq(h.createdAt) })),
    allowedEvents: availableEvents(d.status).filter((e) => can(actor.role, EVENT_ACTION[e], ctx)),
    canEdit: can(actor.role, 'developer:update', ctx),
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listDevelopers(
  tx: Tx,
  q: z.output<typeof DeveloperListQuerySchema>,
  today: string,
): Promise<Paginated<DeveloperListItem>> {
  const where: SQL[] = [isNull(developers.deletedAt)];
  if (q.pool) where.push(inArray(developers.status, [...POOL_STATUSES[q.pool]]));
  if (q.status) where.push(eq(developers.status, q.status));
  if (q.seniority) where.push(eq(developers.seniority, q.seniority));
  if (q.placed) where.push(eq(developers.isPlaced, q.placed === 'true'));
  if (q.flagged) where.push(isNotNull(developers.deletionFlaggedAt));
  if (q.availability === 'now') {
    where.push(or(isNull(developers.availableFrom), lte(developers.availableFrom, today))!);
  } else if (q.availability === '30') {
    const in30 = new Date(new Date(today).getTime() + 30 * 864e5).toISOString().slice(0, 10);
    where.push(or(isNull(developers.availableFrom), lte(developers.availableFrom, in30))!);
  }
  if (q.q) {
    const like = `%${escapeLike(q.q)}%`;
    where.push(
      or(
        sql`(coalesce(${developers.firstName}, '') || ' ' || coalesce(${developers.lastName}, '') || ' ' || coalesce(${developers.title}, '')) ilike ${like}`,
        sql`exists (select 1 from ${developerSkills} ds join ${skills} s on s.id = ds.skill_id
                    where ds.developer_id = ${developers.id} and (s.name ilike ${like} or exists (select 1 from unnest(s.aliases) a where a ilike ${like})))`,
      )!,
    );
  }
  for (const skillId of q.skills) {
    where.push(
      sql`exists (select 1 from ${developerSkills} ds where ds.developer_id = ${developers.id} and ds.skill_id = ${skillId})`,
    );
  }
  const cond = and(...where);
  const dir = q.dir === 'asc' ? asc : desc;
  const order =
    q.sort === 'name'
      ? [dir(developers.lastName), dir(developers.firstName)]
      : q.sort === 'available'
        ? [
            sql`${developers.availableFrom} ${sql.raw(q.dir === 'asc' ? 'asc nulls first' : 'desc nulls last')}`,
          ]
        : q.sort === 'seniority'
          ? [dir(developers.seniority), asc(developers.lastName)]
          : [dir(developers.updatedAt)];

  const skillNames = sql<string[]>`coalesce((select array_agg(s.name order by ds.level desc, s.name)
      from ${developerSkills} ds join ${skills} s on s.id = ds.skill_id where ds.developer_id = ${developers.id}), '{}')`;

  const [rows, [total]] = await Promise.all([
    tx
      .select({ d: developers, skillNames })
      .from(developers)
      .where(cond)
      .orderBy(...order, asc(developers.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(developers)
      .where(cond),
  ]);

  return {
    items: rows.map(({ d, skillNames: names }) => ({
      id: d.id,
      publicRef: d.publicRef,
      firstName: d.firstName,
      lastName: d.lastName,
      title: d.title,
      seniority: d.seniority,
      status: d.status,
      isPlaced: d.isPlaced,
      availableFrom: d.availableFrom,
      consentGiven: d.consentGiven,
      processingRestricted: d.processingRestricted,
      deletionFlaggedAt: iso(d.deletionFlaggedAt),
      topSkills: names.slice(0, 5),
      skillCount: names.length,
      updatedAt: isoReq(d.updatedAt),
    })),
    total: total?.n ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  };
}
