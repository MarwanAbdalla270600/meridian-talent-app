import { expect, test } from '@playwright/test';
import { api, completeProfile, login, unique } from './helpers';

test('4 · matching ranks correctly and only considers Pool 2', async ({ browser }) => {
  const egypt = await browser.newPage();
  await login(egypt, 'egypt');
  const austria = await browser.newPage();
  await login(austria, 'austria');
  const e = await api(egypt);
  const a = await api(austria);

  const approvedName = unique('Freigabe');
  const pool1Name = unique('PoolEins');
  const approved = await (await e.post('/api/developers', completeProfile(approvedName))).json();
  await e.post(`/api/developers/${approved.id}/transitions`, { event: 'submit' });
  expect(
    (await a.post(`/api/developers/${approved.id}/transitions`, { event: 'approve' })).status(),
  ).toBe(200);
  const pool1 = await (await e.post('/api/developers', completeProfile(pool1Name))).json();
  expect(pool1.status).toBe('P1_IN_ERFASSUNG');

  const skills = (await (await a.get('/api/skills')).json()) as { id: string; name: string }[];
  const client = await (await a.post('/api/clients', { name: unique('Kunde ') })).json();
  const requestTitle = unique('Java Anfrage ');
  const req = await (
    await a.post('/api/requests', {
      clientId: client.id,
      title: requestTitle,
      seniority: 'senior',
      startBy: null,
      skills: [
        { skillId: skills.find((s) => s.name === 'Java')!.id, minLevel: 4 },
        { skillId: skills.find((s) => s.name === 'Kubernetes')!.id, minLevel: 3 },
      ],
    })
  ).json();

  await austria.goto(`/requests?id=${req.id}`);
  await expect(austria.getByRole('heading', { name: requestTitle })).toBeVisible();
  const row = austria.getByRole('listitem').filter({ hasText: approvedName });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Fehlt: Kubernetes');
  await expect(row).toContainText('%');
  await expect(austria.getByText(pool1Name)).toHaveCount(0);

  await row.getByRole('button', { name: 'Vorschlagen' }).click();
  await expect(row.getByRole('button', { name: /Vorgeschlagen/ })).toBeVisible();
  const updated = await (await a.get(`/api/requests/${req.id}`)).json();
  expect(updated.status).toBe('proposed');

  // Pool 1 cannot be proposed even via the API.
  expect(
    (await a.post(`/api/requests/${req.id}/proposals`, { developerId: pool1.id })).status(),
  ).toBe(409);
});

test('5 · Egypt sees no client data, also not via direct API calls', async ({ page }) => {
  await login(page, 'egypt');
  for (const label of ['Anfragen', 'Kunden', 'Nutzer', 'Audit-Log']) {
    await expect(page.getByRole('link', { name: label })).toHaveCount(0);
  }
  await page.goto('/requests');
  await expect(page).toHaveURL(/\/developers/);
  await page.goto('/clients');
  await expect(page).toHaveURL(/\/developers/);

  const e = await api(page);
  for (const path of ['/api/clients', '/api/requests', '/api/admin/users', '/api/admin/audit']) {
    expect((await e.get(path)).status(), path).toBe(403);
  }
  expect((await e.post('/api/clients', { name: 'Hack' })).status()).toBe(403);
  const list = await (await e.get('/api/developers?pool=p2')).json();
  expect(JSON.stringify(list)).not.toContain('hourlyRate');
});
