import { beforeEach, describe, expect, test } from 'bun:test';
import { approvedDev, completeProfile, createDev, transition } from './fixtures';
import { createTestContext, type TestClient, type TestContext } from './helpers';

let ctx: TestContext;
let egypt: TestClient;
let austria: TestClient;
let skillId: (name: string) => string;

async function setupRequest(over: Record<string, unknown> = {}) {
  const client = await austria.post('/api/clients', {
    name: 'Alpenbank (Test)',
    contactName: 'Frau Berger',
  });
  const r = await austria.post('/api/requests', {
    clientId: client.body.id,
    title: 'Fullstack Kundenportal',
    seniority: 'senior',
    startBy: '2026-12-31',
    skills: [
      { skillId: skillId('Java'), minLevel: 4 },
      { skillId: skillId('Spring Boot'), minLevel: 4 },
      { skillId: skillId('Angular'), minLevel: 3 },
      { skillId: skillId('AWS'), minLevel: 3 },
    ],
    ...over,
  });
  expect(r.status).toBe(201);
  return r.body;
}

beforeEach(async () => {
  ctx = await createTestContext();
  egypt = await ctx.login('egypt_editor');
  austria = await ctx.login('austria_reviewer');
  const catalog = (await austria.get('/api/skills')).body as { id: string; name: string }[];
  skillId = (name) => catalog.find((s) => s.name === name)!.id;
});

describe('clients', () => {
  test('CRUD with counts; clients with open requests cannot be deleted', async () => {
    const req = await setupRequest();
    const list = await austria.get('/api/clients');
    expect(list.body[0]).toMatchObject({
      name: 'Alpenbank (Test)',
      requestCount: 1,
      openRequestCount: 1,
    });
    expect((await austria.del(`/api/clients/${req.clientId}`)).status).toBe(409);
    await austria.patch(`/api/requests/${req.id}/status`, { status: 'lost' });
    expect((await austria.del(`/api/clients/${req.clientId}`)).status).toBe(200);
    expect((await austria.get('/api/clients')).body).toHaveLength(0);
  });

  test('validation: invalid e-mail is rejected', async () => {
    const r = await austria.post('/api/clients', { name: 'X', contactEmail: 'not-an-email' });
    expect(r.status).toBe(400);
  });
});

describe('requests & matching', () => {
  test('matching considers only Pool 2 and ranks correctly', async () => {
    const perfect = await approvedDev(ctx, { firstName: 'Perfekt', lastName: 'Match' });
    const partial = await approvedDev(ctx, {
      firstName: 'Teil',
      lastName: 'Weise',
      seniority: 'mid',
      skills: [
        { skillName: 'Java', level: 2, years: 2 },
        { skillName: 'Angular', level: 4, years: 3 },
        { skillName: 'PHP', level: 5, years: 5 },
      ],
    });
    // Pool 1 developers with ideal skills must not appear.
    const p1 = await createDev(egypt, { firstName: 'Pool', lastName: 'Eins' });
    const submitted = await createDev(egypt, { firstName: 'Pool', lastName: 'Eingereicht' });
    await transition(egypt, submitted.id, 'submit');

    const req = await setupRequest();
    const m = await austria.get(`/api/requests/${req.id}/matches`);
    expect(m.status).toBe(200);
    const ids = m.body.map((x: { developerId: string }) => x.developerId);
    expect(ids).toEqual([perfect.id, partial.id]);
    expect(ids).not.toContain(p1.id);
    expect(ids).not.toContain(submitted.id);

    expect(m.body[0].score).toBe(100);
    const second = m.body[1];
    expect(second.missing).toEqual(['Spring Boot', 'AWS']);
    expect(second.belowLevel).toEqual([{ name: 'Java', actual: 2, required: 4 }]);
    expect(second.score).toBe(Math.round((5 / 14) * 100));
  });

  test('late availability is penalised by factor 0.85', async () => {
    await approvedDev(ctx, { availableFrom: '2027-03-01' });
    const req = await setupRequest();
    const [m] = (await austria.get(`/api/requests/${req.id}/matches`)).body;
    expect(m.availableInTime).toBe(false);
    expect(m.score).toBe(85);
  });

  test('first proposal moves the request from open to proposed; proposals are audited', async () => {
    const dev = await approvedDev(ctx);
    const req = await setupRequest();
    expect(req.status).toBe('open');
    const p = await austria.post(`/api/requests/${req.id}/proposals`, { developerId: dev.id });
    expect(p.status).toBe(201);
    expect(p.body.status).toBe('proposed');
    expect(p.body.proposals[0]).toMatchObject({ developerId: dev.id, status: 'proposed' });
    const matches = (await austria.get(`/api/requests/${req.id}/matches`)).body;
    expect(matches[0].proposed).toBe(true);

    const removed = await austria.del(`/api/requests/${req.id}/proposals/${dev.id}`);
    expect(removed.body.proposals).toHaveLength(0);
    expect(removed.body.status).toBe('proposed'); // status is not reverted automatically
  });

  test('rule 1: Pool 1 developers cannot be assigned to requests', async () => {
    const dev = await createDev(egypt);
    const req = await setupRequest();
    const r = await austria.post(`/api/requests/${req.id}/proposals`, { developerId: dev.id });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('NOT_CLIENT_READY');
  });

  test('proposal status can be tracked', async () => {
    const dev = await approvedDev(ctx);
    const req = await setupRequest();
    await austria.post(`/api/requests/${req.id}/proposals`, { developerId: dev.id });
    const r = await austria.patch(`/api/requests/${req.id}/proposals/${dev.id}`, {
      status: 'interview',
    });
    expect(r.body.proposals[0].status).toBe('interview');
  });

  test('duplicate skills in a request are rejected', async () => {
    const client = await austria.post('/api/clients', { name: 'X' });
    const r = await austria.post('/api/requests', {
      clientId: client.body.id,
      title: 'X',
      seniority: null,
      startBy: null,
      skills: [
        { skillId: skillId('Java'), minLevel: 3 },
        { skillId: skillId('Java'), minLevel: 4 },
      ],
    });
    expect(r.status).toBe(400);
  });

  test('editing a request replaces its skills', async () => {
    const req = await setupRequest();
    const r = await austria.put(`/api/requests/${req.id}`, {
      clientId: req.clientId,
      title: 'Nur Java',
      seniority: 'mid',
      startBy: null,
      status: 'open',
      skills: [{ skillId: skillId('Java'), minLevel: 5 }],
    });
    expect(r.body.skills).toEqual([{ skillId: skillId('Java'), name: 'Java', minLevel: 5 }]);
  });
});

describe('E2E-5 at API level: Egypt sees no client data', () => {
  test('all client/request/matching endpoints are forbidden for Egypt', async () => {
    const dev = await approvedDev(ctx);
    const req = await setupRequest();
    const calls: [string, string, unknown?][] = [
      ['GET', '/api/clients'],
      ['POST', '/api/clients', { name: 'Hack' }],
      ['PUT', `/api/clients/${req.clientId}`, { name: 'Hack' }],
      ['GET', '/api/requests'],
      ['GET', `/api/requests/${req.id}`],
      ['GET', `/api/requests/${req.id}/matches`],
      ['POST', `/api/requests/${req.id}/proposals`, { developerId: dev.id }],
      ['PATCH', `/api/requests/${req.id}/status`, { status: 'won' }],
      ['GET', `/api/developers/${dev.id}/pdf`],
      ['GET', `/api/requests/${req.id}/pdf`],
    ];
    for (const [method, path, body] of calls) {
      const r = await egypt.request(method, path, body);
      expect({ path, status: r.status }).toEqual({ path, status: 403 });
    }
  });

  test('developer payloads for Egypt never contain rates or request data', async () => {
    const dev = await approvedDev(ctx);
    const req = await setupRequest();
    await austria.post(`/api/requests/${req.id}/proposals`, { developerId: dev.id });
    const detail = await egypt.get(`/api/developers/${dev.id}`);
    const text = JSON.stringify(detail.body);
    expect(detail.body).not.toHaveProperty('hourlyRateCents');
    expect(text).not.toContain('Alpenbank');
    expect(text).not.toContain(req.id);
    const list = await egypt.get('/api/developers');
    expect(JSON.stringify(list.body)).not.toContain('hourlyRate');
  });

  test('Egypt cannot approve even via direct API call (state is unchanged)', async () => {
    const dev = await createDev(egypt, completeProfile());
    await transition(egypt, dev.id, 'submit');
    expect((await transition(egypt, dev.id, 'approve')).status).toBe(403);
    expect((await egypt.get(`/api/developers/${dev.id}`)).body.status).toBe('P1_EINGEREICHT');
  });
});
