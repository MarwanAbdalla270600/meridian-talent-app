import type { DeveloperCreateInput } from '@meridian/shared';
import type { TestClient, TestContext } from './helpers';

/** A profile that satisfies the full checklist. */
export function completeProfile(over: Partial<DeveloperCreateInput> = {}): DeveloperCreateInput {
  return {
    firstName: 'Karim',
    lastName: 'Hassan',
    email: 'karim@example.test',
    phone: null,
    title: 'Senior Fullstack Developer',
    seniority: 'senior',
    location: 'Remote',
    availableFrom: null,
    hourlyRateCents: 4800,
    currency: 'EUR',
    isPlaced: false,
    summaryDe: 'Fullstack-Entwickler mit Java und Angular.',
    summaryEn: 'Fullstack developer with Java and Angular.',
    educationDe: 'B.Sc. Informatik',
    educationEn: 'B.Sc. Computer Science',
    internalNote: 'Bevorzugt lange Projekte.',
    consentGiven: true,
    consentAt: '2026-10-01',
    consentVersion: '2026-01',
    skills: [
      { skillName: 'Java', level: 5, years: 9 },
      { skillName: 'Spring Boot', level: 5, years: 7 },
      { skillName: 'Angular', level: 4, years: 6 },
      { skillName: 'AWS', level: 3, years: 4 },
    ],
    experiences: [
      {
        role: 'Senior Fullstack Developer',
        company: 'Fintech (Demo)',
        fromDate: '2021-03',
        toDate: null,
        descriptionDe: 'Kundenportal.',
        descriptionEn: 'Customer portal.',
      },
    ],
    certifications: [{ name: 'AWS Certified Developer', issuer: 'AWS', year: 2023 }],
    languages: [
      { language: 'de', level: 'B2' },
      { language: 'en', level: 'C1' },
      { language: 'ar', level: 'NATIVE' },
    ],
    ...over,
  };
}

export async function createDev(c: TestClient, over: Partial<DeveloperCreateInput> = {}) {
  const r = await c.post('/api/developers', completeProfile(over));
  if (r.status !== 201) throw new Error(`create failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { id: string; version: number; publicRef: number };
}

export const transition = (c: TestClient, id: string, event: string, note?: string) =>
  c.post(`/api/developers/${id}/transitions`, { event, ...(note !== undefined ? { note } : {}) });

/** Creates a developer and moves it to Pool 2 (Egypt submits, Austria approves). */
export async function approvedDev(ctx: TestContext, over: Partial<DeveloperCreateInput> = {}) {
  const egypt = await ctx.login('egypt_editor');
  const austria = await ctx.login('austria_reviewer');
  const dev = await createDev(egypt, over);
  const s = await transition(egypt, dev.id, 'submit');
  if (s.status !== 200) throw new Error(`submit failed ${JSON.stringify(s.body)}`);
  const a = await transition(austria, dev.id, 'approve');
  if (a.status !== 200) throw new Error(`approve failed ${JSON.stringify(a.body)}`);
  return a.body as { id: string; version: number; publicRef: number };
}

/** Minimal valid PDF bytes. */
export const PDF_BYTES = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF',
);
