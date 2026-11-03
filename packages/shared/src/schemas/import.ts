import { z } from 'zod';
import { IMPORT_STATUSES, LANGUAGE_LEVELS, SENIORITIES } from '../enums';
import { DeveloperCreateSchema } from './developer';

/**
 * Shape the AI extraction must return (converted to JSON Schema for tool use).
 * Lengths are not limited here (limits apply when the reviewed draft is saved).
 * Every value is wrapped with a confidence (0–1) and an optional verbatim source snippet.
 */
const field = <T extends z.ZodType>(value: T) =>
  z.object({
    value: value.nullable(),
    confidence: z.number().min(0).max(1),
    source: z.string().nullable(),
  });

export const CvExtractionSchema = z.object({
  firstName: field(z.string()),
  lastName: field(z.string()),
  email: field(z.string()),
  phone: field(z.string()),
  title: field(z.string()),
  seniority: field(z.enum(SENIORITIES)),
  location: field(z.string()),
  summaryDe: field(z.string()),
  summaryEn: field(z.string()),
  educationDe: field(z.string()),
  educationEn: field(z.string()),
  skills: z.array(
    z.object({
      name: z.string(),
      level: z.number().int().min(1).max(5),
      years: z.number().min(0).max(60),
      confidence: z.number().min(0).max(1),
    }),
  ),
  experiences: z.array(
    z.object({
      role: z.string(),
      company: z.string(),
      fromDate: z.string().describe('YYYY-MM'),
      toDate: z.string().nullable().describe('YYYY-MM or null if current'),
      descriptionDe: z.string().nullable(),
      descriptionEn: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: z.string().nullable(),
      year: z.number().int().nullable(),
    }),
  ),
  languages: z.array(
    z.object({
      language: z.string().describe('ISO 639-1 code, e.g. de, en, ar'),
      level: z.enum(LANGUAGE_LEVELS),
    }),
  ),
});
export type CvExtraction = z.infer<typeof CvExtractionSchema>;

export const ImportSchema = z.object({
  id: z.uuid(),
  status: z.enum(IMPORT_STATUSES),
  filename: z.string(),
  errorCode: z.string().nullable(),
  model: z.string().nullable(),
  extraction: CvExtractionSchema.nullable(),
  developerId: z.uuid().nullable(),
  createdAt: z.string(),
});
export type ImportDto = z.infer<typeof ImportSchema>;

/** Reviewed values are submitted as a normal create payload plus confirmation of every section. */
export const IMPORT_REVIEW_SECTIONS = [
  'personal',
  'summary',
  'education',
  'skills',
  'experiences',
  'certifications',
  'languages',
] as const;
export type ImportReviewSection = (typeof IMPORT_REVIEW_SECTIONS)[number];

export const ImportConfirmSchema = z
  .object({
    developer: DeveloperCreateSchema,
    confirmedSections: z.array(z.enum(IMPORT_REVIEW_SECTIONS)),
  })
  .strict();
