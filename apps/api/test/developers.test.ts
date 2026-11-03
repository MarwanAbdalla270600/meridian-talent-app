import { beforeEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { auditLog, requestDevelopers, statusHistory } from '../src/db/schema';
import { saveSettings } from '../src/modules/settings/settings.service';
import { approvedDev, completeProfile, createDev, PDF_BYTES, transition } from './fixtures';
import { createTestContext, type TestClient, type TestContext } from './helpers';

let ctx: TestContext;
let egypt: TestClient;
let austria: TestClient;
let admin: TestClient;

beforeEach(async () => {
  ctx = await createTestContext();
  egypt = await ctx.login('egypt_editor');
  austria = await ctx.login('austria_reviewer');
  admin = await ctx.login('admin');
});

describe('create & read', () => {
  test('new developers always start in P1_IN_ERFASSUNG', async () => {
    const dev = await createDev(egypt);
    const r = await egypt.get(`/api/developers/${dev.id}`);
    expect(r.body.status).toBe('P1_IN_ERFASSUNG');
    expect(r.body.history[0].toStatus).toBe('P1_IN_ERFASSUNG');
    expect(r.body.publicRef).toBeGreaterThan(0);
  });

  test('unknown fields are rejected (mass assignment)', async () => {
    const r = await egypt.post('/api/developers', {
      ...completeProfile(),
      status: 'P2_FREIGEGEBEN',
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
  });

  test('egypt cannot set or see the hourly rate', async () => {
    const dev = await createDev(egypt, { hourlyRateCents: 9999 });
    const asEgypt = await egypt.get(`/api/developers/${dev.id}`);
    expect(asEgypt.body).not.toHaveProperty('hourlyRateCents');
    const asAustria = await austria.get(`/api/developers/${dev.id}`);
    expect(asAustria.body.hourlyRateCents).toBeNull();
  });

  test('unknown skills from Egypt become pending catalog proposals', async () => {
    const dev = await createDev(egypt, {
      skills: [...completeProfile().skills, { skillName: 'Elixir Phoenix', level: 3, years: 2 }],
    });
    const r = await egypt.get(`/api/developers/${dev.id}`);
    const s = r.body.skills.find((x: { name: string }) => x.name === 'Elixir Phoenix');
    expect(s.skillStatus).toBe('pending');
    const pending = await austria.get('/api/skills?status=pending');
    expect(pending.body.map((x: { name: string }) => x.name)).toContain('Elixir Phoenix');
  });

  test('skill spellings are normalised to catalog entries', async () => {
    const dev = await createDev(egypt, {
      skills: [
        { skillName: 'k8s', level: 3, years: 2 },
        { skillName: 'postgres', level: 3, years: 2 },
        { skillName: 'node js', level: 3, years: 2 },
      ],
    });
    const names = (await egypt.get(`/api/developers/${dev.id}`)).body.skills
      .map((s: { name: string }) => s.name)
      .sort();
    expect(names).toEqual(['Kubernetes', 'Node.js', 'PostgreSQL']);
  });

  test('list supports search, pool, skill filter and pagination', async () => {
    await createDev(egypt, { firstName: 'Anna', lastName: 'Alpha' });
    await createDev(egypt, {
      firstName: 'Bert',
      lastName: 'Beta',
      skills: [{ skillName: 'PHP', level: 4, years: 5 }],
    });
    const approved = await approvedDev(ctx, { firstName: 'Carla', lastName: 'Gamma' });

    expect((await egypt.get('/api/developers?q=beta')).body.total).toBe(1);
    expect((await egypt.get('/api/developers?q=php')).body.items[0].lastName).toBe('Beta');
    expect(
      (await egypt.get('/api/developers?pool=p2')).body.items.map((d: { id: string }) => d.id),
    ).toEqual([approved.id]);
    expect((await egypt.get('/api/developers?pool=p1')).body.total).toBe(2);

    const skills = (await egypt.get('/api/skills?q=PHP')).body;
    const php = skills.find((s: { name: string }) => s.name === 'PHP');
    expect((await egypt.get(`/api/developers?skills=${php.id}`)).body.total).toBe(1);

    const page = await egypt.get('/api/developers?pageSize=2&page=2&sort=name&dir=asc');
    expect(page.body.items).toHaveLength(1);
    expect(page.body.total).toBe(3);
  });

  test('search terms with SQL wildcards are escaped', async () => {
    await createDev(egypt);
    expect((await egypt.get('/api/developers?q=%25')).body.total).toBe(0);
  });
});

describe('two-phase workflow (section 4)', () => {
  test('rule 2: submit requires a complete checklist', async () => {
    const dev = await createDev(egypt, {
      summaryEn: null,
      skills: [{ skillName: 'Java', level: 3, years: 1 }],
    });
    const r = await transition(egypt, dev.id, 'submit');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CHECKLIST_INCOMPLETE');
    expect(r.body.details.missing).toEqual(expect.arrayContaining(['summaryEn', 'skillsMin3']));
  });

  test('rule 2: consent requires date and version', async () => {
    const dev = await createDev(egypt, { consentAt: null });
    expect((await transition(egypt, dev.id, 'submit')).body.details.missing).toContain('consent');
  });

  test('happy path: submit → approve moves the profile into Pool 2', async () => {
    const dev = await createDev(egypt);
    expect((await transition(egypt, dev.id, 'submit')).body.status).toBe('P1_EINGEREICHT');
    const a = await transition(austria, dev.id, 'approve');
    expect(a.status).toBe(200);
    expect(a.body.status).toBe('P2_FREIGEGEBEN');
    expect(a.body.approvedByName).toBe('austria_reviewer');
  });

  test('rule 3: only Austria may approve or return', async () => {
    const dev = await createDev(egypt);
    await transition(egypt, dev.id, 'submit');
    expect((await transition(egypt, dev.id, 'approve')).status).toBe(403);
    expect((await transition(egypt, dev.id, 'return', 'x')).status).toBe(403);
  });

  test('rule 3: return requires a note and sends the profile back', async () => {
    const dev = await createDev(egypt);
    await transition(egypt, dev.id, 'submit');
    const noNote = await transition(austria, dev.id, 'return', '   ');
    expect(noNote.status).toBe(400);
    expect(noNote.body.code).toBe('NOTE_REQUIRED');
    const r = await transition(austria, dev.id, 'return', 'Bitte Zertifikate ergänzen');
    expect(r.body.status).toBe('P1_IN_ERFASSUNG');
    expect(r.body.reviewNote).toBe('Bitte Zertifikate ergänzen');
    expect((await egypt.get(`/api/developers/${dev.id}`)).body.canEdit).toBe(true);
  });

  test('rule 3: the checklist is re-checked on approve', async () => {
    const dev = await createDev(egypt);
    await transition(egypt, dev.id, 'submit');
    // Austria edits the submitted profile and removes the consent → approve must fail.
    const cur = (await austria.get(`/api/developers/${dev.id}`)).body;
    const upd = await austria.put(`/api/developers/${dev.id}`, {
      ...completeProfile(),
      consentGiven: false,
      version: cur.version,
    });
    expect(upd.status).toBe(200);
    const a = await transition(austria, dev.id, 'approve');
    expect(a.status).toBe(409);
    expect(a.body.code).toBe('CHECKLIST_INCOMPLETE');
  });

  test('approve is impossible without submit (no skipping the review)', async () => {
    const dev = await createDev(egypt);
    const r = await transition(austria, dev.id, 'approve');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INVALID_TRANSITION');
  });

  test('rule 4: demote is Austria-only and removes request proposals with audit', async () => {
    const dev = await approvedDev(ctx);
    const client = await austria.post('/api/clients', { name: 'Kunde (Test)' });
    const skills = (await austria.get('/api/skills?q=Java')).body;
    const req = await austria.post('/api/requests', {
      clientId: client.body.id,
      title: 'Java Dev',
      seniority: 'senior',
      startBy: null,
      skills: [
        { skillId: skills.find((s: { name: string }) => s.name === 'Java').id, minLevel: 3 },
      ],
    });
    expect(
      (await austria.post(`/api/requests/${req.body.id}/proposals`, { developerId: dev.id }))
        .status,
    ).toBe(201);

    expect((await transition(egypt, dev.id, 'demote', 'x')).status).toBe(403);
    const r = await transition(austria, dev.id, 'demote', 'Profil veraltet');
    expect(r.body.status).toBe('P1_IN_ERFASSUNG');
    const remaining = await ctx.db
      .select()
      .from(requestDevelopers)
      .where(eq(requestDevelopers.developerId, dev.id));
    expect(remaining).toHaveLength(0);
    const audit = await ctx.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'request.proposal.remove'));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.diff).toMatchObject({ developerId: dev.id, reason: 'demoted' });
  });

  test('rule 5: submitted profiles are read-only for Egypt (also documents)', async () => {
    const dev = await createDev(egypt);
    await transition(egypt, dev.id, 'submit');
    const detail = (await egypt.get(`/api/developers/${dev.id}`)).body;
    expect(detail.canEdit).toBe(false);
    const upd = await egypt.put(`/api/developers/${dev.id}`, {
      ...completeProfile(),
      version: detail.version,
    });
    expect(upd.status).toBe(403);
    const form = new FormData();
    form.set('kind', 'other');
    form.set('file', new File([PDF_BYTES], 'x.pdf', { type: 'application/pdf' }));
    expect(
      (await egypt.request('POST', `/api/developers/${dev.id}/documents`, undefined, { form }))
        .status,
    ).toBe(403);
  });

  test('approved profiles are read-only for Egypt', async () => {
    const dev = await approvedDev(ctx);
    const detail = (await egypt.get(`/api/developers/${dev.id}`)).body;
    expect(
      (
        await egypt.put(`/api/developers/${dev.id}`, {
          ...completeProfile(),
          version: detail.version,
        })
      ).status,
    ).toBe(403);
  });

  test('rule 6: every status change is recorded in history and audit', async () => {
    const dev = await createDev(egypt);
    await transition(egypt, dev.id, 'submit');
    await transition(austria, dev.id, 'return', 'Rückfrage');
    await transition(egypt, dev.id, 'submit');
    await transition(austria, dev.id, 'approve');
    await transition(austria, dev.id, 'demote', 'Neu prüfen');
    const hist = await ctx.db
      .select()
      .from(statusHistory)
      .where(eq(statusHistory.developerId, dev.id));
    expect(hist.map((h) => h.toStatus)).toEqual([
      'P1_IN_ERFASSUNG',
      'P1_EINGEREICHT',
      'P1_IN_ERFASSUNG',
      'P1_EINGEREICHT',
      'P2_FREIGEGEBEN',
      'P1_IN_ERFASSUNG',
    ]);
    expect(hist.find((h) => h.note === 'Rückfrage')?.actorId).toBe(ctx.userIds.austria_reviewer);
    const audit = await ctx.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'developer.status'), eq(auditLog.entityId, dev.id)));
    expect(audit).toHaveLength(5);
    expect(audit[0]!.actorId).toBe(ctx.userIds.egypt_editor);
  });

  test('rule 7: Austria editing an approved profile keeps it approved and logs a field diff', async () => {
    const dev = await approvedDev(ctx);
    const cur = (await austria.get(`/api/developers/${dev.id}`)).body;
    const r = await austria.put(`/api/developers/${dev.id}`, {
      ...completeProfile(),
      hourlyRateCents: null,
      title: 'Lead Developer',
      version: cur.version,
    });
    expect(r.body.status).toBe('P2_FREIGEGEBEN');
    const [entry] = await ctx.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'developer.update'), eq(auditLog.entityId, dev.id)));
    expect(entry!.diff).toEqual({
      title: { from: 'Senior Fullstack Developer', to: 'Lead Developer' },
    });
  });

  test('rule 7 (optional): critical change resets approval when enabled', async () => {
    await saveSettings(ctx.db, { resetApprovalOnCriticalChange: true });
    const dev = await approvedDev(ctx);
    let cur = (await austria.get(`/api/developers/${dev.id}`)).body;
    // non-critical change keeps the approval
    let r = await austria.put(`/api/developers/${dev.id}`, {
      ...completeProfile(),
      internalNote: 'neu',
      version: cur.version,
    });
    expect(r.body.status).toBe('P2_FREIGEGEBEN');
    cur = r.body;
    r = await austria.put(`/api/developers/${dev.id}`, {
      ...completeProfile(),
      internalNote: 'neu',
      title: 'Architect',
      version: cur.version,
    });
    expect(r.body.status).toBe('P1_IN_ERFASSUNG');
    expect(r.body.reviewNote).toContain('title');
  });

  test('optimistic locking rejects stale versions', async () => {
    const dev = await createDev(egypt);
    const ok = await egypt.put(`/api/developers/${dev.id}`, {
      ...completeProfile(),
      version: dev.version,
    });
    expect(ok.status).toBe(200);
    const stale = await egypt.put(`/api/developers/${dev.id}`, {
      ...completeProfile(),
      version: dev.version,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
  });

  test('allowedEvents reflect role and status', async () => {
    const dev = await createDev(egypt);
    await transition(egypt, dev.id, 'submit');
    expect((await egypt.get(`/api/developers/${dev.id}`)).body.allowedEvents).toEqual([]);
    expect((await austria.get(`/api/developers/${dev.id}`)).body.allowedEvents.sort()).toEqual([
      'approve',
      'return',
    ]);
  });
});

describe('RBAC (section 5)', () => {
  test('egypt cannot delete developers; austria can (soft delete)', async () => {
    const dev = await createDev(egypt);
    expect((await egypt.del(`/api/developers/${dev.id}`)).status).toBe(403);
    expect((await austria.del(`/api/developers/${dev.id}`)).status).toBe(200);
    expect((await austria.get(`/api/developers/${dev.id}`)).status).toBe(404);
  });

  test('egypt cannot access clients, requests, matching, pdf, users, audit, settings', async () => {
    const dev = await approvedDev(ctx);
    for (const path of [
      '/api/clients',
      '/api/requests',
      `/api/developers/${dev.id}/pdf`,
      '/api/admin/users',
      '/api/admin/audit',
      '/api/admin/settings',
    ]) {
      const r = await egypt.get(path);
      expect([403]).toContain(r.status);
    }
  });

  test('unauthenticated access is rejected everywhere', async () => {
    const anon = ctx.client();
    for (const path of ['/api/developers', '/api/skills', '/api/clients', '/api/requests']) {
      expect((await anon.get(path)).status).toBe(401);
    }
  });

  test('skill catalog: Egypt proposes, Austria approves/merges, Egypt cannot manage', async () => {
    const p = await egypt.post('/api/skills', { name: 'Svelte' });
    expect(p.body.status).toBe('pending');
    expect((await egypt.patch(`/api/skills/${p.body.id}`, { status: 'approved' })).status).toBe(
      403,
    );
    expect(
      (await austria.patch(`/api/skills/${p.body.id}`, { status: 'approved' })).body.status,
    ).toBe('approved');
    const dup = await egypt.post('/api/skills', { name: 'react.js' });
    expect(dup.status).toBe(409);

    const typo = await egypt.post('/api/skills', { name: 'Kotlinn' });
    const dev = await createDev(egypt, { skills: [{ skillId: typo.body.id, level: 3, years: 2 }] });
    const kotlin = (await austria.get('/api/skills?q=Kotlin')).body.find(
      (s: { name: string }) => s.name === 'Kotlin',
    );
    expect(
      (await admin.post(`/api/skills/${typo.body.id}/merge`, { targetId: kotlin.id })).status,
    ).toBe(200);
    const names = (await egypt.get(`/api/developers/${dev.id}`)).body.skills.map(
      (s: { name: string }) => s.name,
    );
    expect(names).toEqual(['Kotlin']);
  });
});

describe('documents', () => {
  const upload = (c: TestClient, id: string, bytes: Uint8Array, name: string, kind = 'cv') => {
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', new File([bytes], name));
    return c.request('POST', `/api/developers/${id}/documents`, undefined, { form });
  };

  test('upload, list, presigned download and delete', async () => {
    const dev = await createDev(egypt);
    const up = await upload(egypt, dev.id, PDF_BYTES, 'Lebenslauf Karim.pdf');
    expect(up.status).toBe(201);
    expect(up.body.mime).toBe('application/pdf');
    expect(up.body.virusScanStatus).toBe('skipped');
    expect(ctx.storage.objects.size).toBe(1);
    const key = [...ctx.storage.objects.keys()][0]!;
    expect(key).toStartWith(`developers/${dev.id}/`);
    expect(key).not.toContain('Karim'); // random storage key

    const list = await egypt.get(`/api/developers/${dev.id}/documents`);
    expect(list.body).toHaveLength(1);
    const dl = await egypt.get(`/api/developers/${dev.id}/documents/${up.body.id}/download`);
    expect(dl.body.url).toContain('X-Amz-Expires');
    expect((await egypt.del(`/api/developers/${dev.id}/documents/${up.body.id}`)).status).toBe(200);
    expect(ctx.storage.objects.size).toBe(0);
  });

  test('type is detected from magic bytes, not the file name', async () => {
    const dev = await createDev(egypt);
    const fake = await upload(egypt, dev.id, new TextEncoder().encode('MZ executable'), 'cv.pdf');
    expect(fake.status).toBe(415);
    expect(fake.body.code).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  test('images are allowed for consent proofs but not for CVs', async () => {
    const dev = await createDev(egypt);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect((await upload(egypt, dev.id, png, 'scan.png', 'cv')).status).toBe(415);
    expect((await upload(egypt, dev.id, png, 'scan.png', 'consent')).status).toBe(201);
  });

  test('size limit is enforced', async () => {
    const dev = await createDev(egypt);
    const big = new Uint8Array(ctx.deps.env.MAX_UPLOAD_MB * 1024 * 1024 + 10);
    big.set(PDF_BYTES);
    const r = await upload(egypt, dev.id, big, 'big.pdf');
    expect(r.status).toBe(413);
  });
});
