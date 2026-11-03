import { describe, expect, test } from 'bun:test';
import { can, permissionsOf, type Action, type DeveloperPolicyContext } from '../src';

const p1: DeveloperPolicyContext = { status: 'P1_IN_ERFASSUNG', processingRestricted: false };
const sub: DeveloperPolicyContext = { status: 'P1_EINGEREICHT', processingRestricted: false };
const p2: DeveloperPolicyContext = { status: 'P2_FREIGEGEBEN', processingRestricted: false };

describe('policy – egypt_editor', () => {
  const r = 'egypt_editor' as const;
  test('can create, import, edit and submit Pool 1', () => {
    for (const a of ['developer:create', 'import:cv', 'developer:submit'] as Action[])
      expect(can(r, a)).toBe(true);
    expect(can(r, 'developer:update', p1)).toBe(true);
  });
  test('sees no clients, requests, matching, rates or pdf', () => {
    for (const a of [
      'client:read',
      'request:read',
      'matching:read',
      'developer:viewRate',
      'developer:editRate',
      'pdf:generate',
    ] as Action[])
      expect(can(r, a)).toBe(false);
  });
  test('cannot approve, return, demote, delete', () => {
    for (const a of [
      'developer:approve',
      'developer:return',
      'developer:demote',
      'developer:delete',
    ] as Action[])
      expect(can(r, a)).toBe(false);
  });
  test('profile is locked while submitted and after approval', () => {
    expect(can(r, 'developer:update', sub)).toBe(false);
    expect(can(r, 'developer:update', p2)).toBe(false);
    expect(can(r, 'document:upload', sub)).toBe(false);
    expect(can(r, 'developer:read', sub)).toBe(true);
  });
  test('no administration', () => {
    for (const a of ['user:manage', 'audit:read', 'gdpr:erase', 'settings:manage'] as Action[])
      expect(can(r, a)).toBe(false);
  });
});

describe('policy – austria_reviewer', () => {
  const r = 'austria_reviewer' as const;
  test('reviews and manages clients/requests', () => {
    for (const a of [
      'developer:approve',
      'developer:return',
      'developer:demote',
      'client:write',
      'request:write',
      'matching:read',
      'skill:manage',
    ] as Action[])
      expect(can(r, a)).toBe(true);
  });
  test('may edit submitted and approved profiles', () => {
    expect(can(r, 'developer:update', sub)).toBe(true);
    expect(can(r, 'developer:update', p2)).toBe(true);
  });
  test('pdf only for Pool 2', () => {
    expect(can(r, 'pdf:generate', p2)).toBe(true);
    expect(can(r, 'pdf:generate', p1)).toBe(false);
    expect(can(r, 'pdf:generate', sub)).toBe(false);
  });
  test('no administration', () => {
    for (const a of ['user:manage', 'audit:read', 'gdpr:erase', 'gdpr:export'] as Action[])
      expect(can(r, a)).toBe(false);
  });
});

describe('policy – admin', () => {
  test('has every permission', () => {
    expect(permissionsOf('admin')).toContain('user:manage');
    expect(permissionsOf('admin')).toContain('developer:approve');
    expect(permissionsOf('admin')).toContain('gdpr:erase');
  });
});

describe('policy – processing restriction (Art. 18 GDPR)', () => {
  const restricted = { ...p2, processingRestricted: true };
  test('blocks mutation and pdf for everyone', () => {
    for (const role of ['egypt_editor', 'austria_reviewer', 'admin'] as const) {
      expect(can(role, 'developer:update', restricted)).toBe(false);
      expect(can(role, 'pdf:generate', restricted)).toBe(false);
    }
  });
  test('reading stays possible', () => {
    expect(can('admin', 'developer:read', restricted)).toBe(true);
  });
});
