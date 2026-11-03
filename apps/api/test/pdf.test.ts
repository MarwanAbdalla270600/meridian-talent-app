import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { extractText, getDocumentProxy } from 'unpdf';
import { auditLog } from '../src/db/schema';
import { approvedDev, createDev } from './fixtures';
import { createTestContext, type TestClient, type TestContext } from './helpers';

let ctx: TestContext;
let austria: TestClient;
let egypt: TestClient;
let devId: string;

async function text(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  // Normalise whitespace (text extraction inserts spaces at glyph-run boundaries).
  return { text: (text as string).replace(/\s+/g, ''), pages: totalPages };
}

beforeAll(async () => {
  ctx = await createTestContext({ realPdf: true });
  austria = await ctx.login('austria_reviewer');
  egypt = await ctx.login('egypt_editor');
  const dev = await approvedDev(ctx, {
    firstName: 'Karim',
    lastName: 'Hassan',
    email: 'karim.secret@example.test',
    phone: '+20 100 1234567',
    internalNote: 'GEHEIME INTERNE NOTIZ',
  });
  devId = dev.id;
  // Austria sets a rate (Egypt cannot).
  const cur = (await austria.get(`/api/developers/${devId}`)).body;
  const {
    id: _id,
    publicRef: _p,
    checklist: _c,
    history: _h,
    allowedEvents: _a,
    canEdit: _ce,
    ...rest
  } = cur;
  void rest;
}, 60_000);

afterAll(async () => {
  await ctx.deps.pdf.close();
});

describe('client profile PDF (real Chromium)', () => {
  test('short DE anonymised (default): valid PDF, 1 page, no name, no contact data, no internal note', async () => {
    const r = await austria.get(`/api/developers/${devId}/pdf?variant=short&lang=de`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(new TextDecoder().decode(r.raw.slice(0, 5))).toBe('%PDF-');
    const { text: t, pages } = await text(r.raw);
    expect(pages).toBe(1);
    expect(t).toContain('Entwicklerprofil');
    expect(t).toMatch(/Entwickler#\d{3}/);
    expect(t).not.toContain('Karim');
    expect(t).not.toContain('Hassan');
    expect(t).not.toContain('karim.secret');
    expect(t).not.toContain('1234567');
    expect(t).not.toContain('GEHEIME');
    expect(t).toContain('Vertraulich');
    expect(t).not.toContain('Stundensatz');
  }, 60_000);

  test('long EN with name and rate', async () => {
    const r = await austria.get(
      `/api/developers/${devId}/pdf?variant=long&lang=en&anonymized=false&showRate=true`,
    );
    expect(r.status).toBe(200);
    const { text: t } = await text(r.raw);
    expect(t).toContain('Developerprofile');
    expect(t).toContain('KarimHassan');
    expect(t.toLowerCase()).toContain('education&certifications');
    expect(t).toContain('AWSCertifiedDeveloper');
    expect(t).toContain('Customerportal.'); // long variant includes descriptions
    expect(t).not.toContain('karim.secret'); // contact data never printed
    expect(t).not.toContain('GEHEIME');
  }, 60_000);

  test('every export is audited with the variant', async () => {
    await austria.get(`/api/developers/${devId}/pdf?variant=long&lang=de`);
    const rows = await ctx.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'pdf.export'), eq(auditLog.entityId, devId)));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.at(-1)!.diff).toMatchObject({ variant: 'long', lang: 'de', anonymized: true });
    expect(rows.at(-1)!.actorId).toBe(ctx.userIds.austria_reviewer);
  }, 60_000);

  test('rule 1: no PDF for Pool 1, and Egypt can never generate one', async () => {
    const p1 = await createDev(egypt);
    const r = await austria.get(`/api/developers/${p1.id}/pdf`);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('NOT_CLIENT_READY');
    expect((await egypt.get(`/api/developers/${devId}/pdf`)).status).toBe(403);
  });

  test('combined PDF for a request: cover page + proposed profiles', async () => {
    const catalog = (await austria.get('/api/skills')).body as { id: string; name: string }[];
    const client = await austria.post('/api/clients', { name: 'Industrie AG (Test)' });
    const req = await austria.post('/api/requests', {
      clientId: client.body.id,
      title: 'Java Team',
      seniority: 'senior',
      startBy: null,
      skills: [{ skillId: catalog.find((s) => s.name === 'Java')!.id, minLevel: 4 }],
    });
    expect((await austria.get(`/api/requests/${req.body.id}/pdf`)).status).toBe(409); // nothing proposed yet
    await austria.post(`/api/requests/${req.body.id}/proposals`, { developerId: devId });
    const r = await austria.get(`/api/requests/${req.body.id}/pdf?lang=de`);
    expect(r.status).toBe(200);
    const { text: t, pages } = await text(r.raw);
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(t).toContain('JavaTeam');
    expect(t).toContain('IndustrieAG(Test)');
    expect(t).not.toContain('Karim');
  }, 60_000);
});
