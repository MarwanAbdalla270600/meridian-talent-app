import { describe, expect, test } from 'bun:test';
import {
  evaluateChecklist,
  isChecklistComplete,
  missingChecklistItems,
  type ChecklistInput,
} from '../src';

const complete: ChecklistInput = {
  firstName: 'Karim',
  lastName: 'Hassan',
  title: 'Senior Fullstack Developer',
  summaryDe: 'Kurzprofil',
  summaryEn: 'Summary',
  consentGiven: true,
  consentAt: '2026-10-01',
  consentVersion: '2026-01',
  skillCount: 3,
  experienceCount: 1,
  languageCount: 1,
};

describe('checklist', () => {
  test('complete profile passes', () => {
    expect(isChecklistComplete(complete)).toBe(true);
    expect(evaluateChecklist(complete)).toHaveLength(7);
  });
  test.each([
    ['nameAndRole', { title: '  ' }],
    ['nameAndRole', { firstName: null }],
    ['skillsMin3', { skillCount: 2 }],
    ['experienceMin1', { experienceCount: 0 }],
    ['summaryDe', { summaryDe: '' }],
    ['summaryEn', { summaryEn: null }],
    ['languagesMin1', { languageCount: 0 }],
    ['consent', { consentGiven: false }],
    ['consent', { consentAt: null }],
    ['consent', { consentVersion: '' }],
  ] as const)('%s fails for %o', (key, patch) => {
    const r = { ...complete, ...patch } as ChecklistInput;
    expect(isChecklistComplete(r)).toBe(false);
    expect(missingChecklistItems(r)).toContain(key);
  });
});
