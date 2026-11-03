import { expect, test } from '@playwright/test';
import { api, login, unique } from './helpers';

test.describe.serial('two-phase workflow', () => {
  const lastName = unique('Erfasst');
  let developerUrl = '';

  test('1 · Egypt captures a developer and submits it for review', async ({ page }) => {
    await login(page, 'egypt');
    // Egypt sees no client-related navigation.
    await expect(page.getByRole('link', { name: 'Anfragen' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Neuer Entwickler' }).click();
    await page.getByLabel('Vorname').fill('E2E');
    await page.getByLabel('Nachname').fill(lastName);
    await page.getByLabel('Rolle', { exact: true }).fill('Senior Java Developer');
    await page.getByLabel('Level', { exact: true }).selectOption('senior');
    await page.getByLabel('Kurzprofil (Deutsch)').fill('Java-Entwickler mit Spring Boot.');
    await page.getByLabel('Kurzprofil (Englisch)').fill('Java developer with Spring Boot.');

    await page.getByRole('button', { name: 'Skill hinzufügen' }).click();
    await page.getByRole('button', { name: 'Skill hinzufügen' }).click();
    const skills = ['Java', 'Spring Boot', 'Angular'];
    for (let i = 0; i < 3; i++)
      await page.getByLabel(`Skill ${i + 1}`, { exact: true }).fill(skills[i]!);

    await page.getByRole('button', { name: 'Station hinzufügen' }).click();
    await page.getByLabel('Position').fill('Java Developer');
    await page.getByLabel('Firma').fill('Beispiel GmbH');
    await page.getByLabel('Von').fill('2021-03');

    await page.getByLabel('Der Kandidat hat in die Verarbeitung eingewilligt').check();
    await page.getByLabel('Datum der Einwilligung').fill('2026-10-01');
    await page.getByLabel('Version des Einwilligungstextes').fill('2026-01');
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByRole('heading', { level: 1, name: `E2E ${lastName}` })).toBeVisible();
    await expect(page.getByText('In Erfassung').first()).toBeVisible();
    developerUrl = page.url();

    await page.getByRole('button', { name: 'Zur Prüfung einreichen' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Zur Prüfung einreichen' }).click();
    await expect(page.getByText('Zur Prüfung eingereicht').first()).toBeVisible();
    await expect(page.getByText('wartet auf Prüfung in Österreich')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bearbeiten' })).toHaveCount(0);
  });

  test('2 · Austria returns with a note, Egypt completes, Austria approves', async ({
    browser,
  }) => {
    const austria = await browser.newPage();
    await login(austria, 'austria');
    await austria.goto(developerUrl);
    await austria.getByRole('button', { name: 'Zurück an Ägypten' }).click();
    await austria
      .getByLabel('Was soll in Ägypten ergänzt werden?')
      .fill('Bitte Zertifikate ergänzen.');
    await austria.getByRole('dialog').getByRole('button', { name: 'Zurück an Ägypten' }).click();
    await expect(austria.getByText('Bitte Zertifikate ergänzen.').first()).toBeVisible();

    const egypt = await browser.newPage();
    await login(egypt, 'egypt');
    await egypt.goto(developerUrl);
    await expect(egypt.getByText('Rückfrage aus Österreich')).toBeVisible();
    await egypt.getByRole('link', { name: 'Bearbeiten' }).click();
    await egypt.getByRole('button', { name: 'Zertifikat hinzufügen' }).click();
    await egypt.getByPlaceholder('Zertifikat').fill('Oracle Certified Professional Java');
    await egypt.getByRole('button', { name: 'Speichern' }).click();
    await expect(egypt.getByText('Oracle Certified Professional Java')).toBeVisible();
    await egypt.getByRole('button', { name: 'Zur Prüfung einreichen' }).click();
    await egypt.getByRole('dialog').getByRole('button', { name: 'Zur Prüfung einreichen' }).click();
    await expect(egypt.getByText('Zur Prüfung eingereicht').first()).toBeVisible();

    await austria.reload();
    await austria.getByRole('button', { name: 'Freigeben' }).click();
    await austria.getByRole('dialog').getByRole('button', { name: 'Freigeben' }).click();
    await expect(austria.getByText('Freigegeben', { exact: true }).first()).toBeVisible();
    await expect(austria.getByRole('button', { name: 'Kundenprofil erstellen' })).toBeVisible();

    // History shows the complete trail.
    await expect(austria.getByText('Bitte Zertifikate ergänzen.').last()).toBeVisible();
    await austria.close();
    await egypt.close();
  });

  test('3 · client profile PDFs (short/long, DE/EN, anonymised) for Pool 2', async ({ page }) => {
    await login(page, 'austria');
    await page.goto(developerUrl);
    await page.getByRole('button', { name: 'Kundenprofil erstellen' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Anonymisiert')).toBeChecked();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'PDF erzeugen' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^profil-\d{3}-short-de\.pdf$/);

    const client = await api(page);
    const id = developerUrl.split('/').pop()!;
    for (const variant of ['short', 'long']) {
      for (const lang of ['de', 'en']) {
        const r = await client.get(`/api/developers/${id}/pdf?variant=${variant}&lang=${lang}`);
        expect(r.status()).toBe(200);
        expect(r.headers()['content-type']).toBe('application/pdf');
        const body = await r.body();
        expect(body.subarray(0, 5).toString()).toBe('%PDF-');
      }
    }
  });
});
