import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const USERS = {
  egypt: {
    email: process.env['E2E_EGYPT_EMAIL'] ?? 'egypt@meridian.local',
    password: process.env['E2E_EGYPT_PASSWORD'] ?? 'Egypt-E2E-Passw0rd!',
  },
  austria: {
    email: process.env['E2E_AUSTRIA_EMAIL'] ?? 'austria@meridian.local',
    password: process.env['E2E_AUSTRIA_PASSWORD'] ?? 'Austria-E2E-Passw0rd!',
  },
  admin: {
    email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@meridian.local',
    password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin-E2E-Passw0rd!',
  },
};

export const unique = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export async function login(page: Page, who: keyof typeof USERS) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(USERS[who].email);
  await page.getByLabel('Passwort', { exact: true }).fill(USERS[who].password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/developers/);
}

/** API calls from the logged-in page context (same cookies, CSRF header from the cookie). */
export async function api(page: Page) {
  const request: APIRequestContext = page.request;
  const base = new URL(page.url()).origin;
  const csrf = async () =>
    (await page.context().cookies()).find((c) => c.name.endsWith('mt_csrf'))?.value ?? '';
  const headers = async () => ({ origin: base, 'x-csrf-token': await csrf() });
  return {
    get: (path: string) => request.get(base + path),
    post: async (path: string, data?: unknown) =>
      request.post(base + path, { data, headers: await headers() }),
  };
}

export function completeProfile(lastName: string) {
  return {
    firstName: 'E2E',
    lastName,
    title: 'Senior Java Developer',
    seniority: 'senior',
    location: 'Remote',
    availableFrom: null,
    summaryDe: 'Java-Entwickler.',
    summaryEn: 'Java developer.',
    consentGiven: true,
    consentAt: '2026-10-01',
    consentVersion: '2026-01',
    skills: [
      { skillName: 'Java', level: 5, years: 8 },
      { skillName: 'Spring Boot', level: 5, years: 6 },
      { skillName: 'Angular', level: 4, years: 5 },
    ],
    experiences: [{ role: 'Developer', company: 'Demo GmbH', fromDate: '2020-01', toDate: null }],
    certifications: [],
    languages: [{ language: 'en', level: 'C1' }],
  };
}
