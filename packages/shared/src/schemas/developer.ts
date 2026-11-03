import { z } from 'zod';
import {
  DEVELOPER_STATUSES,
  DOCUMENT_KINDS,
  LANGUAGE_LEVELS,
  POOLS,
  SENIORITIES,
  SKILL_CATEGORIES,
  SKILL_STATUSES,
  STATUS_EVENTS,
  VIRUS_SCAN_STATUSES,
} from '../enums';
import { CHECKLIST_KEYS } from '../checklist';
import { IsoDateSchema, MonthSchema, optionalText, requiredText } from './common';

export const SkillLevelSchema = z.number().int().min(1).max(5);

export const DeveloperSkillInputSchema = z
  .object({
    skillId: z.uuid().optional(),
    /** Free text: matched against the catalog, otherwise proposed as a new (pending) skill. */
    skillName: z.string().trim().min(1).max(80).optional(),
    level: SkillLevelSchema,
    years: z.number().min(0).max(60),
  })
  .strict()
  .refine((s) => !!s.skillId || !!s.skillName, { message: 'skillId or skillName required' });
export type DeveloperSkillInput = z.infer<typeof DeveloperSkillInputSchema>;

export const ExperienceInputSchema = z
  .object({
    role: requiredText(160),
    company: requiredText(160),
    fromDate: MonthSchema,
    /** `null` = until today. */
    toDate: MonthSchema.nullable(),
    descriptionDe: optionalText(4000),
    descriptionEn: optionalText(4000),
  })
  .strict()
  .refine((e) => e.toDate === null || e.toDate >= e.fromDate, {
    message: 'toDate must not be before fromDate',
    path: ['toDate'],
  });
export type ExperienceInput = z.infer<typeof ExperienceInputSchema>;

export const CertificationInputSchema = z
  .object({
    name: requiredText(200),
    issuer: optionalText(160),
    year: z.number().int().min(1970).max(2100).nullable(),
  })
  .strict();

/** ISO 639 language code, e.g. `de`, `en`, `ar`. Display names come from `Intl.DisplayNames`. */
export const LanguageCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2,3}$/);

export const LanguageInputSchema = z
  .object({ language: LanguageCodeSchema, level: z.enum(LANGUAGE_LEVELS) })
  .strict();

const developerBaseShape = {
  firstName: optionalText(80),
  lastName: optionalText(80),
  email: z
    .email()
    .max(254)
    .nullish()
    .or(z.literal('').transform(() => null))
    .transform((v) => v ?? null),
  phone: optionalText(40),
  title: optionalText(160),
  seniority: z.enum(SENIORITIES),
  location: optionalText(120),
  availableFrom: IsoDateSchema.nullable(),
  /** Only honoured for roles with `developer:editRate`; ignored otherwise. */
  hourlyRateCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  currency: z.string().length(3).toUpperCase().default('EUR'),
  isPlaced: z.boolean().default(false),
  summaryDe: optionalText(4000),
  summaryEn: optionalText(4000),
  educationDe: optionalText(1000),
  educationEn: optionalText(1000),
  internalNote: optionalText(4000),
  consentGiven: z.boolean().default(false),
  consentAt: IsoDateSchema.nullable(),
  consentVersion: optionalText(40),
  skills: z.array(DeveloperSkillInputSchema).max(80),
  experiences: z.array(ExperienceInputSchema).max(40),
  certifications: z.array(CertificationInputSchema).max(40),
  languages: z.array(LanguageInputSchema).max(20),
};

/** Create payload. `.strict()` rejects unknown keys (mass-assignment protection). */
export const DeveloperCreateSchema = z.object(developerBaseShape).strict();
export type DeveloperCreateInput = z.infer<typeof DeveloperCreateSchema>;

/** Full replace of the aggregate with optimistic locking via `version`. */
export const DeveloperUpdateSchema = z
  .object({ ...developerBaseShape, version: z.number().int().min(1) })
  .strict();
export type DeveloperUpdateInput = z.infer<typeof DeveloperUpdateSchema>;

export const DeveloperListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  pool: z.enum(POOLS).optional(),
  status: z.enum(DEVELOPER_STATUSES).optional(),
  seniority: z.enum(SENIORITIES).optional(),
  availability: z.enum(['now', '30']).optional(),
  /** Comma-separated skill ids; all must be present. */
  skills: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(z.uuid()).max(20)),
  placed: z.enum(['true', 'false']).optional(),
  flagged: z.enum(['true']).optional(),
  sort: z.enum(['name', 'updated', 'available', 'seniority']).default('updated'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type DeveloperListQuery = z.input<typeof DeveloperListQuerySchema>;

export const TransitionSchema = z
  .object({
    event: z.enum(STATUS_EVENTS),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type TransitionInput = z.infer<typeof TransitionSchema>;

/* ------------------------------ responses ------------------------------ */

export const DeveloperSkillSchema = z.object({
  skillId: z.uuid(),
  name: z.string(),
  category: z.enum(SKILL_CATEGORIES),
  skillStatus: z.enum(SKILL_STATUSES),
  level: z.number().int(),
  years: z.number(),
});

export const ExperienceSchema = z.object({
  id: z.uuid(),
  role: z.string(),
  company: z.string(),
  fromDate: z.string(),
  toDate: z.string().nullable(),
  descriptionDe: z.string().nullable(),
  descriptionEn: z.string().nullable(),
});

export const CertificationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  issuer: z.string().nullable(),
  year: z.number().int().nullable(),
});

export const LanguageSchema = z.object({
  language: z.string(),
  level: z.enum(LANGUAGE_LEVELS),
});

export const ChecklistItemSchema = z.object({ key: z.enum(CHECKLIST_KEYS), ok: z.boolean() });

export const StatusHistoryEntrySchema = z.object({
  id: z.uuid(),
  fromStatus: z.enum(DEVELOPER_STATUSES).nullable(),
  toStatus: z.enum(DEVELOPER_STATUSES),
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const DeveloperListItemSchema = z.object({
  id: z.uuid(),
  publicRef: z.number().int(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  title: z.string().nullable(),
  seniority: z.enum(SENIORITIES),
  status: z.enum(DEVELOPER_STATUSES),
  isPlaced: z.boolean(),
  availableFrom: z.string().nullable(),
  consentGiven: z.boolean(),
  processingRestricted: z.boolean(),
  deletionFlaggedAt: z.string().nullable(),
  topSkills: z.array(z.string()),
  skillCount: z.number().int(),
  updatedAt: z.string(),
});
export type DeveloperListItem = z.infer<typeof DeveloperListItemSchema>;

export const DeveloperDetailSchema = z.object({
  id: z.uuid(),
  publicRef: z.number().int(),
  version: z.number().int(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  title: z.string().nullable(),
  seniority: z.enum(SENIORITIES),
  location: z.string().nullable(),
  availableFrom: z.string().nullable(),
  /** Omitted for roles without `developer:viewRate`. */
  hourlyRateCents: z.number().int().nullable().optional(),
  currency: z.string(),
  status: z.enum(DEVELOPER_STATUSES),
  isPlaced: z.boolean(),
  summaryDe: z.string().nullable(),
  summaryEn: z.string().nullable(),
  educationDe: z.string().nullable(),
  educationEn: z.string().nullable(),
  internalNote: z.string().nullable(),
  reviewNote: z.string().nullable(),
  consentGiven: z.boolean(),
  consentAt: z.string().nullable(),
  consentVersion: z.string().nullable(),
  processingRestricted: z.boolean(),
  restrictionReason: z.string().nullable(),
  deletionFlaggedAt: z.string().nullable(),
  deletionFlagReason: z.string().nullable(),
  approvedAt: z.string().nullable(),
  approvedByName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  skills: z.array(DeveloperSkillSchema),
  experiences: z.array(ExperienceSchema),
  certifications: z.array(CertificationSchema),
  languages: z.array(LanguageSchema),
  checklist: z.array(ChecklistItemSchema),
  history: z.array(StatusHistoryEntrySchema),
  /** Status events the current user may trigger right now. */
  allowedEvents: z.array(z.enum(STATUS_EVENTS)),
  canEdit: z.boolean(),
});
export type DeveloperDetail = z.infer<typeof DeveloperDetailSchema>;

export const DocumentSchema = z.object({
  id: z.uuid(),
  kind: z.enum(DOCUMENT_KINDS),
  filename: z.string(),
  mime: z.string(),
  size: z.number().int(),
  virusScanStatus: z.enum(VIRUS_SCAN_STATUSES),
  uploadedByName: z.string().nullable(),
  createdAt: z.string(),
});
export type DocumentDto = z.infer<typeof DocumentSchema>;

export const DocumentKindQuerySchema = z.object({ kind: z.enum(DOCUMENT_KINDS).default('other') });

export const DownloadUrlSchema = z.object({ url: z.string(), expiresInSeconds: z.number() });

export const RestrictSchema = z
  .object({ restricted: z.boolean(), reason: z.string().trim().max(500).optional() })
  .strict();
