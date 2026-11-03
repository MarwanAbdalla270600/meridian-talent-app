import { z } from 'zod';
import { SKILL_CATEGORIES, SKILL_STATUSES } from '../enums';

export const SkillSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: z.enum(SKILL_CATEGORIES),
  aliases: z.array(z.string()),
  status: z.enum(SKILL_STATUSES),
  usageCount: z.number().int(),
});
export type Skill = z.infer<typeof SkillSchema>;

export const SkillListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(SKILL_STATUSES).optional(),
});

export const SkillCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    category: z.enum(SKILL_CATEGORIES).default('other'),
    aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  })
  .strict();

export const SkillUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    category: z.enum(SKILL_CATEGORIES).optional(),
    aliases: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    status: z.literal('approved').optional(),
  })
  .strict();

/** Merge a (pending) skill into an existing one; developer/request references are re-pointed. */
export const SkillMergeSchema = z.object({ targetId: z.uuid() }).strict();
