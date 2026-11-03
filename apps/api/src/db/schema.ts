import {
  DEVELOPER_STATUSES,
  DOCUMENT_KINDS,
  IMPORT_STATUSES,
  LANGUAGE_LEVELS,
  LOCALES,
  PROPOSAL_STATUSES,
  REQUEST_STATUSES,
  ROLES,
  SENIORITIES,
  SKILL_CATEGORIES,
  SKILL_STATUSES,
  VIRUS_SCAN_STATUSES,
} from '@meridian/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* --------------------------------- enums --------------------------------- */
export const roleEnum = pgEnum('user_role', ROLES);
export const localeEnum = pgEnum('locale', LOCALES);
export const developerStatusEnum = pgEnum('developer_status', DEVELOPER_STATUSES);
export const seniorityEnum = pgEnum('seniority', SENIORITIES);
export const skillCategoryEnum = pgEnum('skill_category', SKILL_CATEGORIES);
export const skillStatusEnum = pgEnum('skill_status', SKILL_STATUSES);
export const requestStatusEnum = pgEnum('request_status', REQUEST_STATUSES);
export const proposalStatusEnum = pgEnum('proposal_status', PROPOSAL_STATUSES);
export const documentKindEnum = pgEnum('document_kind', DOCUMENT_KINDS);
export const virusScanStatusEnum = pgEnum('virus_scan_status', VIRUS_SCAN_STATUSES);
export const importStatusEnum = pgEnum('import_status', IMPORT_STATUSES);
export const languageLevelEnum = pgEnum('language_level', LANGUAGE_LEVELS);

/* -------------------------------- helpers -------------------------------- */
const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const tz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const timestamps = {
  createdAt: tz('created_at').notNull().defaultNow(),
  updatedAt: tz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* --------------------------------- auth ---------------------------------- */
export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    role: roleEnum('role').notNull(),
    displayName: text('display_name').notNull(),
    locale: localeEnum('locale').notNull().default('de'),
    /** AES-256-GCM encrypted TOTP secret. */
    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: tz('locked_until'),
    lastLoginAt: tz('last_login_at'),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: tz('expires_at').notNull(),
    lastSeenAt: tz('last_seen_at').notNull().defaultNow(),
    /** Session may only call TOTP enrollment endpoints until 2FA is set up. */
    mustEnrollTotp: boolean('must_enroll_totp').notNull().default(false),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: tz('expires_at').notNull(),
    usedAt: tz('used_at'),
    createdAt: tz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('prt_token_hash_uq').on(t.tokenHash), index('prt_user_idx').on(t.userId)],
);

/* ------------------------------- developers ------------------------------ */
export const developers = pgTable(
  'developers',
  {
    id: id(),
    publicRef: integer('public_ref').notNull().generatedAlwaysAsIdentity(),
    version: integer('version').notNull().default(1),
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email'),
    phone: text('phone'),
    title: text('title'),
    seniority: seniorityEnum('seniority').notNull().default('mid'),
    location: text('location'),
    availableFrom: date('available_from', { mode: 'string' }),
    hourlyRateCents: integer('hourly_rate_cents'),
    currency: text('currency').notNull().default('EUR'),
    status: developerStatusEnum('status').notNull().default('P1_IN_ERFASSUNG'),
    isPlaced: boolean('is_placed').notNull().default(false),
    summaryDe: text('summary_de'),
    summaryEn: text('summary_en'),
    educationDe: text('education_de'),
    educationEn: text('education_en'),
    internalNote: text('internal_note'),
    reviewNote: text('review_note'),
    consentGiven: boolean('consent_given').notNull().default(false),
    consentAt: date('consent_at', { mode: 'string' }),
    consentVersion: text('consent_version'),
    processingRestricted: boolean('processing_restricted').notNull().default(false),
    restrictedAt: tz('restricted_at'),
    restrictionReason: text('restriction_reason'),
    deletionFlaggedAt: tz('deletion_flagged_at'),
    deletionFlagReason: text('deletion_flag_reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: tz('approved_at'),
    deletedAt: tz('deleted_at'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('developers_public_ref_uq').on(t.publicRef),
    index('developers_status_idx')
      .on(t.status)
      .where(sql`${t.deletedAt} is null`),
    index('developers_updated_idx').on(t.updatedAt),
    index('developers_available_idx').on(t.availableFrom),
    index('developers_search_trgm_idx').using(
      'gin',
      sql`(coalesce(${t.firstName}, '') || ' ' || coalesce(${t.lastName}, '') || ' ' || coalesce(${t.title}, '')) gin_trgm_ops`,
    ),
    check('developers_rate_chk', sql`${t.hourlyRateCents} is null or ${t.hourlyRateCents} >= 0`),
    check('developers_currency_chk', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      'developers_approved_chk',
      sql`${t.status} <> 'P2_FREIGEGEBEN' or ${t.approvedAt} is not null`,
    ),
  ],
);

export const skills = pgTable(
  'skills',
  {
    id: id(),
    name: text('name').notNull(),
    category: skillCategoryEnum('category').notNull().default('other'),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: skillStatusEnum('status').notNull().default('approved'),
    proposedBy: uuid('proposed_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('skills_name_lower_uq').on(sql`lower(${t.name})`)],
);

export const developerSkills = pgTable(
  'developer_skills',
  {
    developerId: uuid('developer_id')
      .notNull()
      .references(() => developers.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    level: smallint('level').notNull(),
    years: numeric('years', { precision: 4, scale: 1, mode: 'number' }).notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.developerId, t.skillId] }),
    index('developer_skills_skill_idx').on(t.skillId),
    check('developer_skills_level_chk', sql`${t.level} between 1 and 5`),
    check('developer_skills_years_chk', sql`${t.years} between 0 and 60`),
  ],
);

export const experiences = pgTable(
  'experiences',
  {
    id: id(),
    developerId: uuid('developer_id')
      .notNull()
      .references(() => developers.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    company: text('company').notNull(),
    fromDate: date('from_date', { mode: 'string' }).notNull(),
    toDate: date('to_date', { mode: 'string' }),
    descriptionDe: text('description_de'),
    descriptionEn: text('description_en'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('experiences_developer_idx').on(t.developerId),
    check('experiences_dates_chk', sql`${t.toDate} is null or ${t.toDate} >= ${t.fromDate}`),
  ],
);

export const certifications = pgTable(
  'certifications',
  {
    id: id(),
    developerId: uuid('developer_id')
      .notNull()
      .references(() => developers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    issuer: text('issuer'),
    year: smallint('year'),
    ...timestamps,
  },
  (t) => [index('certifications_developer_idx').on(t.developerId)],
);

export const developerLanguages = pgTable(
  'developer_languages',
  {
    developerId: uuid('developer_id')
      .notNull()
      .references(() => developers.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    level: languageLevelEnum('level').notNull(),
  },
  (t) => [primaryKey({ columns: [t.developerId, t.language] })],
);

export const documents = pgTable(
  'documents',
  {
    id: id(),
    developerId: uuid('developer_id').references(() => developers.id, { onDelete: 'cascade' }),
    kind: documentKindEnum('kind').notNull(),
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    virusScanStatus: virusScanStatusEnum('virus_scan_status').notNull().default('pending'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('documents_storage_key_uq').on(t.storageKey),
    index('documents_developer_idx').on(t.developerId),
  ],
);

export const cvImports = pgTable(
  'cv_imports',
  {
    id: id(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    developerId: uuid('developer_id').references(() => developers.id, { onDelete: 'set null' }),
    status: importStatusEnum('status').notNull().default('processing'),
    model: text('model'),
    extraction: jsonb('extraction'),
    errorCode: text('error_code'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('cv_imports_created_by_idx').on(t.createdBy)],
);

/* --------------------------- clients & requests -------------------------- */
export const clients = pgTable(
  'clients',
  {
    id: id(),
    name: text('name').notNull(),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    note: text('note'),
    deletedAt: tz('deleted_at'),
    ...timestamps,
  },
  (t) => [index('clients_name_idx').on(t.name)],
);

export const requests = pgTable(
  'requests',
  {
    id: id(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    seniority: seniorityEnum('seniority'),
    startBy: date('start_by', { mode: 'string' }),
    status: requestStatusEnum('status').notNull().default('open'),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: tz('deleted_at'),
    ...timestamps,
  },
  (t) => [index('requests_client_idx').on(t.clientId), index('requests_status_idx').on(t.status)],
);

export const requestSkills = pgTable(
  'request_skills',
  {
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    minLevel: smallint('min_level').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.skillId] }),
    check('request_skills_level_chk', sql`${t.minLevel} between 1 and 5`),
  ],
);

export const requestDevelopers = pgTable(
  'request_developers',
  {
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    developerId: uuid('developer_id')
      .notNull()
      .references(() => developers.id, { onDelete: 'cascade' }),
    status: proposalStatusEnum('status').notNull().default('proposed'),
    proposedBy: uuid('proposed_by').references(() => users.id, { onDelete: 'set null' }),
    proposedAt: tz('proposed_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.developerId] }),
    index('request_developers_dev_idx').on(t.developerId),
  ],
);

/* --------------------------- history & audit ----------------------------- */
export const statusHistory = pgTable(
  'status_history',
  {
    id: id(),
    developerId: uuid('developer_id')
      .notNull()
      .references(() => developers.id, { onDelete: 'cascade' }),
    fromStatus: developerStatusEnum('from_status'),
    toStatus: developerStatusEnum('to_status').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: tz('created_at').notNull().defaultNow(),
  },
  (t) => [index('status_history_developer_idx').on(t.developerId, t.createdAt)],
);

/** Append-only (enforced by trigger, see custom migration). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    diff: jsonb('diff'),
    ip: inet('ip'),
    createdAt: tz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_created_idx').on(t.createdAt),
    index('audit_log_entity_idx').on(t.entity, t.entityId),
    index('audit_log_actor_idx').on(t.actorId),
  ],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: tz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
