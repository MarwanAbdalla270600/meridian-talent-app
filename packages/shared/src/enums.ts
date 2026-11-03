/** Central enumerations shared by API, database schema and frontend. */

export const ROLES = ['egypt_editor', 'austria_reviewer', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const DEVELOPER_STATUSES = ['P1_IN_ERFASSUNG', 'P1_EINGEREICHT', 'P2_FREIGEGEBEN'] as const;
export type DeveloperStatus = (typeof DEVELOPER_STATUSES)[number];

/** Pool 1 = captured in Egypt (in progress or submitted), Pool 2 = approved in Austria. */
export const POOLS = ['p1', 'p2'] as const;
export type Pool = (typeof POOLS)[number];
export const POOL_STATUSES: Record<Pool, readonly DeveloperStatus[]> = {
  p1: ['P1_IN_ERFASSUNG', 'P1_EINGEREICHT'],
  p2: ['P2_FREIGEGEBEN'],
};
export const poolOf = (status: DeveloperStatus): Pool =>
  status === 'P2_FREIGEGEBEN' ? 'p2' : 'p1';

export const SENIORITIES = ['junior', 'mid', 'senior', 'lead'] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const SKILL_CATEGORIES = [
  'language',
  'backend',
  'frontend',
  'cloud',
  'devops',
  'database',
  'mobile',
  'qa',
  'legacy',
  'other',
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/** Catalog entries proposed by Egypt stay `pending` until Austria/Admin confirms them. */
export const SKILL_STATUSES = ['approved', 'pending'] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export const REQUEST_STATUSES = ['open', 'proposed', 'interview', 'won', 'lost'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const PROPOSAL_STATUSES = ['proposed', 'interview', 'accepted', 'rejected'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const DOCUMENT_KINDS = ['cv', 'consent', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const VIRUS_SCAN_STATUSES = ['pending', 'clean', 'infected', 'skipped', 'error'] as const;
export type VirusScanStatus = (typeof VIRUS_SCAN_STATUSES)[number];

export const IMPORT_STATUSES = [
  'processing',
  'extracted',
  'failed',
  'manual',
  'completed',
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/** CEFR levels plus native speaker. */
export const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'NATIVE'] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const PDF_VARIANTS = ['short', 'long'] as const;
export type PdfVariant = (typeof PDF_VARIANTS)[number];

export const STATUS_EVENTS = ['submit', 'approve', 'return', 'demote'] as const;
export type StatusEvent = (typeof STATUS_EVENTS)[number];
