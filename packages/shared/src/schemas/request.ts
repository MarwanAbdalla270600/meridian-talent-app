import { z } from 'zod';
import { PROPOSAL_STATUSES, REQUEST_STATUSES, SENIORITIES } from '../enums';
import { IsoDateSchema, optionalText, requiredText } from './common';
import { SkillLevelSchema } from './developer';

export const RequestSkillInputSchema = z
  .object({ skillId: z.uuid(), minLevel: SkillLevelSchema })
  .strict();

export const RequestInputSchema = z
  .object({
    clientId: z.uuid(),
    title: requiredText(200),
    seniority: z.enum(SENIORITIES).nullable(),
    startBy: IsoDateSchema.nullable(),
    status: z.enum(REQUEST_STATUSES).default('open'),
    note: optionalText(4000),
    skills: z.array(RequestSkillInputSchema).min(1).max(30),
  })
  .strict()
  .refine((r) => new Set(r.skills.map((s) => s.skillId)).size === r.skills.length, {
    message: 'Duplicate skill',
    path: ['skills'],
  });
export type RequestInput = z.infer<typeof RequestInputSchema>;

export const RequestStatusUpdateSchema = z.object({ status: z.enum(REQUEST_STATUSES) }).strict();

export const RequestListQuerySchema = z.object({
  clientId: z.uuid().optional(),
  status: z.enum(REQUEST_STATUSES).optional(),
});

export const ProposalSchema = z.object({
  developerId: z.uuid(),
  publicRef: z.number().int(),
  name: z.string(),
  title: z.string().nullable(),
  status: z.enum(PROPOSAL_STATUSES),
  proposedByName: z.string().nullable(),
  proposedAt: z.string(),
});

export const RequestSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  clientName: z.string(),
  title: z.string(),
  seniority: z.enum(SENIORITIES).nullable(),
  startBy: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  note: z.string().nullable(),
  skills: z.array(z.object({ skillId: z.uuid(), name: z.string(), minLevel: z.number().int() })),
  proposals: z.array(ProposalSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RequestDto = z.infer<typeof RequestSchema>;

export const MatchEntrySchema = z.object({
  developerId: z.uuid(),
  publicRef: z.number().int(),
  name: z.string(),
  title: z.string().nullable(),
  seniority: z.enum(SENIORITIES),
  availableFrom: z.string().nullable(),
  isPlaced: z.boolean(),
  score: z.number().int(),
  missing: z.array(z.string()),
  belowLevel: z.array(
    z.object({ name: z.string(), actual: z.number().int(), required: z.number().int() }),
  ),
  seniorityMatch: z.boolean(),
  availableInTime: z.boolean(),
  proposed: z.boolean(),
});
export type MatchEntry = z.infer<typeof MatchEntrySchema>;

export const ProposeSchema = z.object({ developerId: z.uuid() }).strict();
export const ProposalStatusSchema = z.object({ status: z.enum(PROPOSAL_STATUSES) }).strict();
