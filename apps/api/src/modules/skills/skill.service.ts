import { can, normalizeSkillName, type DeveloperSkillInput } from '@meridian/shared';
import { eq, sql } from 'drizzle-orm';
import type { Tx } from '../../db/client';
import { developerSkills, requestSkills, skills } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { Actor } from '../../types';
import { writeAudit } from '../audit/audit.service';

type SkillRow = typeof skills.$inferSelect;

export function findInCatalog(catalog: SkillRow[], name: string): SkillRow | undefined {
  const n = normalizeSkillName(name);
  return catalog.find(
    (s) => normalizeSkillName(s.name) === n || s.aliases.some((a) => normalizeSkillName(a) === n),
  );
}

/**
 * Resolves skill inputs to catalog ids. Unknown names become new catalog entries:
 * `approved` when created by Austria/Admin, otherwise `pending` (proposal workflow).
 * Duplicates collapse to the entry with the highest level.
 */
export async function resolveSkills(
  tx: Tx,
  inputs: DeveloperSkillInput[],
  actor: Actor,
): Promise<{ skillId: string; level: number; years: number }[]> {
  if (!inputs.length) return [];
  const catalog = await tx.select().from(skills);
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const result = new Map<string, { skillId: string; level: number; years: number }>();

  for (const input of inputs) {
    let skill = input.skillId ? byId.get(input.skillId) : undefined;
    if (input.skillId && !skill)
      throw new AppError(400, 'VALIDATION_FAILED', 'Unknown skill', { skillId: input.skillId });
    if (!skill && input.skillName) {
      skill = findInCatalog(catalog, input.skillName);
      if (!skill) {
        if (!can(actor.role, 'skill:propose'))
          throw new AppError(403, 'FORBIDDEN', 'Not allowed to add skills');
        const status = can(actor.role, 'skill:manage') ? 'approved' : 'pending';
        const [created] = await tx
          .insert(skills)
          .values({ name: input.skillName.trim(), category: 'other', status, proposedBy: actor.id })
          .returning();
        skill = created!;
        catalog.push(skill);
        byId.set(skill.id, skill);
        await writeAudit(tx, actor, {
          action: status === 'pending' ? 'skill.proposed' : 'skill.create',
          entity: 'skill',
          entityId: skill.id,
          diff: { name: skill.name },
        });
      }
    }
    if (!skill) continue;
    const prev = result.get(skill.id);
    if (!prev || input.level > prev.level) {
      result.set(skill.id, { skillId: skill.id, level: input.level, years: input.years });
    }
  }
  return [...result.values()];
}

/** Moves all references from `sourceId` to `targetId` and deletes the source skill. */
export async function mergeSkill(tx: Tx, sourceId: string, targetId: string, actor: Actor) {
  if (sourceId === targetId)
    throw new AppError(400, 'BAD_REQUEST', 'Cannot merge a skill into itself');
  const [source] = await tx.select().from(skills).where(eq(skills.id, sourceId));
  const [target] = await tx.select().from(skills).where(eq(skills.id, targetId));
  if (!source || !target) throw new AppError(404, 'NOT_FOUND', 'Skill not found');

  // developer_skills: keep the higher level where both exist.
  await tx.execute(sql`
    insert into developer_skills (developer_id, skill_id, level, years)
    select developer_id, ${targetId}, level, years from developer_skills where skill_id = ${sourceId}
    on conflict (developer_id, skill_id) do update
      set level = greatest(developer_skills.level, excluded.level),
          years = greatest(developer_skills.years, excluded.years)`);
  await tx.delete(developerSkills).where(eq(developerSkills.skillId, sourceId));
  await tx.execute(sql`
    insert into request_skills (request_id, skill_id, min_level)
    select request_id, ${targetId}, min_level from request_skills where skill_id = ${sourceId}
    on conflict (request_id, skill_id) do update set min_level = greatest(request_skills.min_level, excluded.min_level)`);
  await tx.delete(requestSkills).where(eq(requestSkills.skillId, sourceId));

  const aliases = [...new Set([...target.aliases, source.name, ...source.aliases])].filter(
    (a) => a.toLowerCase() !== target.name.toLowerCase(),
  );
  await tx.update(skills).set({ aliases }).where(eq(skills.id, targetId));
  await tx.delete(skills).where(eq(skills.id, sourceId));
  await writeAudit(tx, actor, {
    action: 'skill.merge',
    entity: 'skill',
    entityId: targetId,
    diff: { merged: source.name, into: target.name },
  });
}
