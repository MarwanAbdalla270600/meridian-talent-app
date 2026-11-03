import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { CvExtraction } from '@meridian/shared';
import { eq } from 'drizzle-orm';
import { cvImports, documents } from '../src/db/schema';
import { silentLogger } from '../src/lib/logger';
import { createAnthropicExtractor } from '../src/modules/imports/anthropic-extractor';
import { ExtractionError, type CvExtractor } from '../src/modules/imports/extractor';
import { PDF_BYTES } from './fixtures';
import { createTestContext, testEnv, type TestClient, type TestContext } from './helpers';

const f = <T>(value: T, confidence = 0.9, source: string | null = null) => ({
  value,
  confidence,
  source,
});

export const EXTRACTION: CvExtraction = {
  firstName: f('Mostafa'),
  lastName: f('Khaled'),
  email: f('mostafa@example.test', 0.95, 'mostafa@example.test'),
  phone: f(null, 0),
  title: f('Java Backend Developer'),
  seniority: f('mid' as const, 0.5),
  location: f('Kairo'),
  summaryDe: f('Java-Entwickler mit Spring Boot.', 0.7),
  summaryEn: f('Java developer with Spring Boot.'),
  educationDe: f('B.Sc. Informatik', 0.6),
  educationEn: f('B.Sc. Computer Science'),
  skills: [
    { name: 'Java', level: 4, years: 5, confidence: 0.9 },
    { name: 'Spring Boot', level: 4, years: 4, confidence: 0.85 },
    { name: 'MySQL', level: 3, years: 4, confidence: 0.4 },
  ],
  experiences: [
    {
      role: 'Java Developer',
      company: 'Beispiel GmbH',
      fromDate: '2021-01',
      toDate: null,
      descriptionDe: 'REST-Services',
      descriptionEn: 'REST services',
      confidence: 0.8,
    },
  ],
  certifications: [],
  languages: [
    { language: 'ar', level: 'NATIVE' },
    { language: 'en', level: 'B2' },
  ],
};

const fakeExtractor = (impl: CvExtractor['extract']): CvExtractor => ({ extract: impl });

function upload(c: TestClient, bytes: Uint8Array, name = 'cv.pdf') {
  const form = new FormData();
  form.set('file', new File([bytes], name));
  return c.request('POST', '/api/imports', undefined, { form });
}

const reviewed = (e: CvExtraction) => ({
  firstName: e.firstName.value,
  lastName: e.lastName.value,
  email: e.email.value,
  phone: null,
  title: e.title.value,
  seniority: 'mid',
  location: e.location.value,
  availableFrom: null,
  isPlaced: false,
  currency: 'EUR',
  summaryDe: e.summaryDe.value,
  summaryEn: e.summaryEn.value,
  educationDe: e.educationDe.value,
  educationEn: e.educationEn.value,
  internalNote: null,
  consentGiven: false,
  consentAt: null,
  consentVersion: null,
  skills: e.skills.map((s) => ({ skillName: s.name, level: s.level, years: s.years })),
  experiences: e.experiences.map(({ confidence: _c, ...x }) => x),
  certifications: [],
  languages: e.languages,
});
const ALL = [
  'personal',
  'summary',
  'education',
  'skills',
  'experiences',
  'certifications',
  'languages',
];

describe('CV import with AI extraction', () => {
  let ctx: TestContext;
  let egypt: TestClient;
  beforeEach(async () => {
    ctx = await createTestContext({
      extractor: fakeExtractor(async () => ({ model: 'claude-opus-5-5', extraction: EXTRACTION })),
    });
    egypt = await ctx.login('egypt_editor');
  });

  test('upload extracts a draft with confidences; nothing is saved as developer yet', async () => {
    const r = await upload(egypt, PDF_BYTES);
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('extracted');
    expect(r.body.model).toBe('claude-opus-5-5');
    expect(r.body.extraction.skills[2]).toMatchObject({ name: 'MySQL', confidence: 0.4 });
    expect((await egypt.get('/api/developers')).body.total).toBe(0);
    expect(ctx.storage.objects.size).toBe(1);
    expect([...ctx.storage.objects.keys()][0]).toStartWith('imports/');
  });

  test('confirm requires every section to be reviewed', async () => {
    const imp = (await upload(egypt, PDF_BYTES)).body;
    const partial = await egypt.post(`/api/imports/${imp.id}/confirm`, {
      developer: reviewed(EXTRACTION),
      confirmedSections: ['personal', 'skills'],
    });
    expect(partial.status).toBe(409);
    expect(partial.body.code).toBe('IMPORT_REVIEW_INCOMPLETE');
    expect(partial.body.details.missing).toContain('experiences');
  });

  test('confirmed import becomes a Pool 1 draft with the CV attached; raw extraction is removed', async () => {
    const imp = (await upload(egypt, PDF_BYTES)).body;
    const r = await egypt.post(`/api/imports/${imp.id}/confirm`, {
      developer: reviewed(EXTRACTION),
      confirmedSections: ALL,
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('P1_IN_ERFASSUNG');
    expect(r.body.firstName).toBe('Mostafa');
    expect(r.body.skills.map((s: { name: string }) => s.name).sort()).toEqual([
      'Java',
      'MySQL',
      'Spring Boot',
    ]);
    const docs = await egypt.get(`/api/developers/${r.body.id}/documents`);
    expect(docs.body).toHaveLength(1);
    expect(docs.body[0].kind).toBe('cv');
    const [row] = await ctx.db.select().from(cvImports).where(eq(cvImports.id, imp.id));
    expect(row!.status).toBe('completed');
    expect(row!.extraction).toBeNull();
    // cannot confirm twice
    expect(
      (
        await egypt.post(`/api/imports/${imp.id}/confirm`, {
          developer: reviewed(EXTRACTION),
          confirmedSections: ALL,
        })
      ).status,
    ).toBe(409);
  });

  test('reviewed values are validated like any other profile', async () => {
    const imp = (await upload(egypt, PDF_BYTES)).body;
    const bad = {
      ...reviewed(EXTRACTION),
      experiences: [{ ...reviewed(EXTRACTION).experiences[0], fromDate: '2021' }],
    };
    expect(
      (
        await egypt.post(`/api/imports/${imp.id}/confirm`, {
          developer: bad,
          confirmedSections: ALL,
        })
      ).status,
    ).toBe(400);
  });

  test('only PDF and DOCX are accepted (magic bytes)', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    expect((await upload(egypt, png, 'cv.pdf')).status).toBe(415);
  });

  test('infected files are rejected and not stored', async () => {
    const infected = await createTestContext({
      extractor: fakeExtractor(async () => ({ model: 'm', extraction: EXTRACTION })),
      scanner: { scan: async () => 'infected' },
    });
    const c = await infected.login('egypt_editor');
    const r = await upload(c, PDF_BYTES);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('FILE_INFECTED');
    expect(infected.storage.objects.size).toBe(0);
    expect(await infected.db.select().from(documents)).toHaveLength(0);
  });

  test('imports of other Egypt users are not visible; Austria may see them', async () => {
    const imp = (await upload(egypt, PDF_BYTES)).body;
    const austria = await ctx.login('austria_reviewer');
    expect((await austria.get(`/api/imports/${imp.id}`)).status).toBe(200);
  });
});

describe('CV import error cases and manual fallback', () => {
  test.each([
    ['IMPORT_UNREADABLE', new ExtractionError('IMPORT_UNREADABLE', 'x')],
    ['IMPORT_TIMEOUT', new ExtractionError('IMPORT_TIMEOUT', 'x')],
    ['IMPORT_FAILED', new Error('boom')],
  ])('%s → failed import with manual fallback', async (code, error) => {
    const ctx = await createTestContext({
      extractor: fakeExtractor(async () => {
        throw error;
      }),
    });
    const egypt = await ctx.login('egypt_editor');
    const r = await upload(egypt, PDF_BYTES);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'failed', errorCode: code, extraction: null });
    const m = await egypt.post(`/api/imports/${r.body.id}/manual`);
    expect(m.status).toBe(201);
    expect(m.body.status).toBe('P1_IN_ERFASSUNG');
    expect((await egypt.get(`/api/developers/${m.body.id}/documents`)).body).toHaveLength(1);
  });

  test('feature flag off: no AI call, import goes straight to manual', async () => {
    const ctx = await createTestContext({ extractor: null });
    const egypt = await ctx.login('egypt_editor');
    const me = await egypt.get('/api/auth/me');
    expect(me.body.features.cvAiImport).toBe(false);
    const r = await upload(egypt, PDF_BYTES);
    expect(r.body.status).toBe('manual');
    expect(
      (
        await egypt.post(`/api/imports/${r.body.id}/confirm`, {
          developer: reviewed(EXTRACTION),
          confirmedSections: ALL,
        })
      ).status,
    ).toBe(409);
    expect((await egypt.post(`/api/imports/${r.body.id}/manual`)).status).toBe(201);
  });
});

describe('Anthropic extractor against a mock Messages API', () => {
  let server: ReturnType<typeof Bun.serve>;
  let lastBody: Record<string, unknown> | null = null;
  let mode: 'ok' | 'refusal' | 'error' = 'ok';

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        lastBody = (await req.json()) as Record<string, unknown>;
        if (mode === 'error')
          return Response.json(
            { type: 'error', error: { type: 'api_error', message: 'x' } },
            { status: 500 },
          );
        return Response.json({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: mode === 'refusal' ? [] : [{ type: 'text', text: JSON.stringify(EXTRACTION) }],
          stop_reason: mode === 'refusal' ? 'refusal' : 'end_turn',
          stop_sequence: null,
          stop_details:
            mode === 'refusal' ? { type: 'refusal', category: null, explanation: null } : null,
          usage: { input_tokens: 100, output_tokens: 200 },
        });
      },
    });
  });
  afterAll(() => server.stop(true));

  const extractor = () =>
    createAnthropicExtractor(
      testEnv({
        FEATURE_CV_AI_IMPORT: 'true',
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.port}`,
      }),
      silentLogger,
    );

  test('sends the PDF as a document block with a JSON schema and parses the result', async () => {
    mode = 'ok';
    const r = await extractor().extract({
      bytes: PDF_BYTES,
      mime: 'application/pdf',
      filename: 'cv.pdf',
    });
    expect(r.model).toBe('claude-opus-5-5');
    expect(r.extraction.firstName.value).toBe('Mostafa');
    const body = lastBody as {
      model: string;
      messages: { content: { type: string; source?: { media_type: string } }[] }[];
      output_config: { format: { type: string } };
    };
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.messages[0]!.content[0]).toMatchObject({
      type: 'document',
      source: { media_type: 'application/pdf' },
    });
    expect(body.output_config.format.type).toBe('json_schema');
  });

  test('refusal maps to IMPORT_FAILED', async () => {
    mode = 'refusal';
    await expect(
      extractor().extract({ bytes: PDF_BYTES, mime: 'application/pdf', filename: 'cv.pdf' }),
    ).rejects.toMatchObject({ code: 'IMPORT_FAILED' });
  });

  test('API errors map to IMPORT_FAILED', async () => {
    mode = 'error';
    await expect(
      extractor().extract({ bytes: PDF_BYTES, mime: 'application/pdf', filename: 'cv.pdf' }),
    ).rejects.toMatchObject({ code: 'IMPORT_FAILED' });
  });

  test('unreadable DOCX maps to IMPORT_UNREADABLE without calling the API', async () => {
    lastBody = null;
    const garbage = new TextEncoder().encode(
      'PK\u0003\u0004[Content_Types].xml word/ not really a docx',
    );
    await expect(
      extractor().extract({
        bytes: garbage,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: 'cv.docx',
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_UNREADABLE' });
    expect(lastBody).toBeNull();
  });
});
