import type { DeveloperStatus, Role, StatusEvent } from './enums';

/**
 * Central authorization policy. Every permission decision in API and UI goes
 * through `can()`; the frontend only uses it to hide controls, the API enforces it.
 */
export const ACTIONS = [
  // developers
  'developer:list',
  'developer:read',
  'developer:create',
  'developer:update',
  'developer:delete',
  'developer:submit',
  'developer:approve',
  'developer:return',
  'developer:demote',
  'developer:viewRate',
  'developer:editRate',
  // documents & import
  'document:read',
  'document:upload',
  'document:delete',
  'import:cv',
  // skill catalog
  'skill:read',
  'skill:propose',
  'skill:manage',
  // clients, requests, matching, pdf
  'client:read',
  'client:write',
  'request:read',
  'request:write',
  'matching:read',
  'pdf:generate',
  // administration
  'user:manage',
  'settings:manage',
  'audit:read',
  'gdpr:export',
  'gdpr:erase',
  'gdpr:restrict',
] as const;
export type Action = (typeof ACTIONS)[number];

const EGYPT: readonly Action[] = [
  'developer:list',
  'developer:read',
  'developer:create',
  'developer:update',
  'developer:submit',
  'document:read',
  'document:upload',
  'document:delete',
  'import:cv',
  'skill:read',
  'skill:propose',
];

const AUSTRIA: readonly Action[] = [
  ...EGYPT,
  'developer:delete',
  'developer:approve',
  'developer:return',
  'developer:demote',
  'developer:viewRate',
  'developer:editRate',
  'skill:manage',
  'client:read',
  'client:write',
  'request:read',
  'request:write',
  'matching:read',
  'pdf:generate',
];

const ADMIN: readonly Action[] = [
  ...AUSTRIA,
  'user:manage',
  'settings:manage',
  'audit:read',
  'gdpr:export',
  'gdpr:erase',
  'gdpr:restrict',
];

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  egypt_editor: new Set(EGYPT),
  austria_reviewer: new Set(AUSTRIA),
  admin: new Set(ADMIN),
};

/** Minimal developer facts needed for resource-level decisions. */
export interface DeveloperPolicyContext {
  status: DeveloperStatus;
  processingRestricted: boolean;
}

/** Actions that mutate a developer and are blocked by an Art. 18 GDPR restriction. */
const BLOCKED_WHEN_RESTRICTED: ReadonlySet<Action> = new Set<Action>([
  'developer:update',
  'developer:submit',
  'developer:approve',
  'developer:return',
  'developer:demote',
  'document:upload',
  'document:delete',
  'pdf:generate',
]);

export const EVENT_ACTION: Record<StatusEvent, Action> = {
  submit: 'developer:submit',
  approve: 'developer:approve',
  return: 'developer:return',
  demote: 'developer:demote',
};

export function can(role: Role, action: Action, dev?: DeveloperPolicyContext): boolean {
  if (!MATRIX[role].has(action)) return false;
  if (!dev) return true;

  if (dev.processingRestricted && BLOCKED_WHEN_RESTRICTED.has(action)) return false;

  // Egypt may only modify profiles that are in progress; submitted or approved
  // profiles are read-only for Egypt (rule 5 of the two-phase process).
  if (role === 'egypt_editor') {
    const mutating: readonly Action[] = ['developer:update', 'document:upload', 'document:delete'];
    if (mutating.includes(action) && dev.status !== 'P1_IN_ERFASSUNG') return false;
  }

  // Only Pool 2 is client-ready.
  if (action === 'pdf:generate' && dev.status !== 'P2_FREIGEGEBEN') return false;

  return true;
}

/** All actions a role holds (used to ship capabilities to the frontend). */
export function permissionsOf(role: Role): Action[] {
  return ACTIONS.filter((a) => MATRIX[role].has(a));
}
