/** Approval checklist (required before `submit` and re-checked on `approve`). */

export const CHECKLIST_KEYS = [
  'nameAndRole',
  'skillsMin3',
  'experienceMin1',
  'summaryDe',
  'summaryEn',
  'languagesMin1',
  'consent',
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export interface ChecklistInput {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  summaryDe: string | null;
  summaryEn: string | null;
  consentGiven: boolean;
  consentAt: string | null;
  consentVersion: string | null;
  skillCount: number;
  experienceCount: number;
  languageCount: number;
}

export interface ChecklistItem {
  key: ChecklistKey;
  ok: boolean;
}

const filled = (v: string | null | undefined): boolean => !!v && v.trim().length > 0;

export function evaluateChecklist(d: ChecklistInput): ChecklistItem[] {
  const results: Record<ChecklistKey, boolean> = {
    nameAndRole: filled(d.firstName) && filled(d.lastName) && filled(d.title),
    skillsMin3: d.skillCount >= 3,
    experienceMin1: d.experienceCount >= 1,
    summaryDe: filled(d.summaryDe),
    summaryEn: filled(d.summaryEn),
    languagesMin1: d.languageCount >= 1,
    consent: d.consentGiven && filled(d.consentAt) && filled(d.consentVersion),
  };
  return CHECKLIST_KEYS.map((key) => ({ key, ok: results[key] }));
}

export const isChecklistComplete = (d: ChecklistInput): boolean =>
  evaluateChecklist(d).every((i) => i.ok);

export const missingChecklistItems = (d: ChecklistInput): ChecklistKey[] =>
  evaluateChecklist(d)
    .filter((i) => !i.ok)
    .map((i) => i.key);
