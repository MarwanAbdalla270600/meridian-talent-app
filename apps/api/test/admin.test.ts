import { beforeEach, describe, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { auditLog, developers } from '../src/db/schema';
import { runRetention } from '../src/modules/gdpr/retention.job';
import { approvedDev, completeProfile, createDev, PDF_BYTES } from './fixtures';
import { createTestContext, type TestClient, type TestContext } from './helpers';

let ctx: TestContext;
let admin: TestClient;
let austria: TestClient;
let egypt: TestClient;

beforeEach(async () => {
  ctx = await createTestContext();
  admin = await ctx.login('admin');
  austria = await ctx.login('austria_reviewer');
  egypt = await ctx.login('egypt_editor');
});

describe('user management', () => {
  test('admin creates a user; invite link sets the password', async () => {
    const r = await admin.post('/api/admin/users', {
      email: 'neu@test.local',
      displayName: 'Neue Person',
      role: 'egypt_editor',
    });
    expect(r.status).toBe(201);
    expect(ctx.mailer.sent.at(-1)!.to).toBe('neu@test.local');
    const token = decodeURIComponent(/token=([^\s]+)/.exec(ctx.mailer.sent.at(-1)!.text)![1]!);
    const anon = ctx.client();
    await anon.get('/api/auth/csrf');
    expect((await anon.login('neu@test.local', 'irrelevant-password')).status).toBe(401); // no password yet
    expect(
      (await anon.post('/api/auth/password/reset', { token, newPassword: 'Ein-gutes-Passwort-77' }))
        .status,
    ).toBe(200);
    expect((await anon.login('neu@test.local', 'Ein-gutes-Passwort-77')).status).toBe(200);
  });

  test('duplicate e-mail is rejected', async () => {
    const r = await admin.post('/api/admin/users', {
      email: 'ADMIN@test.local',
      displayName: 'X',
      role: 'admin',
    });
    expect(r.status).toBe(409);
  });

  test('role change and deactivation end the sessions of the user', async () => {
    const id = ctx.userIds.austria_reviewer;
    await admin.patch(`/api/admin/users/${id}`, { role: 'egypt_editor' });
    expect((await austria.get('/api/auth/me')).status).toBe(401);
    const again = await ctx.client().login('austria@test.local', 'Austria-Test-Passw0rd!');
    expect(again.body.role).toBe('egypt_editor');
    await admin.patch(`/api/admin/users/${id}`, { isActive: false });
    expect((await ctx.client().login('austria@test.local', 'Austria-Test-Passw0rd!')).status).toBe(
      401,
    );
  });

  test('admins cannot lock themselves out', async () => {
    expect(
      (await admin.patch(`/api/admin/users/${ctx.userIds.admin}`, { isActive: false })).status,
    ).toBe(409);
    expect(
      (await admin.patch(`/api/admin/users/${ctx.userIds.admin}`, { role: 'egypt_editor' })).status,
    ).toBe(409);
  });

  test('unlock and reset-link', async () => {
    const c = ctx.client();
    for (let i = 0; i < 5; i++) await c.login('egypt@test.local', 'wrong-password-x');
    const list = (await admin.get('/api/admin/users')).body;
    expect(
      list.find((u: { id: string }) => u.id === ctx.userIds.egypt_editor).lockedUntil,
    ).not.toBeNull();
    await admin.post(`/api/admin/users/${ctx.userIds.egypt_editor}/unlock`);
    expect((await ctx.client().login('egypt@test.local', 'Egypt-Test-Passw0rd!')).status).toBe(200);
    expect(
      (await admin.post(`/api/admin/users/${ctx.userIds.egypt_editor}/reset-link`)).status,
    ).toBe(200);
  });

  test('austria and egypt cannot manage users, read the audit log or change settings', async () => {
    for (const c of [austria, egypt]) {
      expect((await c.get('/api/admin/users')).status).toBe(403);
      expect((await c.get('/api/admin/audit')).status).toBe(403);
      expect((await c.patch('/api/admin/settings', { retentionMonths: 1 })).status).toBe(403);
      expect((await c.post('/api/admin/gdpr/retention/run')).status).toBe(403);
    }
  });
});

describe('audit log', () => {
  test('lists entries with filters and actor names', async () => {
    await createDev(egypt);
    const r = await admin.get('/api/admin/audit?entity=developer&action=developer.create');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.items[0]).toMatchObject({
      action: 'developer.create',
      actorName: 'egypt_editor',
    });
  });

  test('is append-only at database level', async () => {
    await createDev(egypt);
    const fails = async (q: ReturnType<typeof sql>) => {
      try {
        await ctx.db.execute(q);
        return 'no error';
      } catch (err) {
        return String((err as { cause?: Error }).cause?.message ?? err);
      }
    };
    expect(await fails(sql`update audit_log set action = 'x'`)).toContain('append-only');
    expect(await fails(sql`delete from audit_log`)).toContain('append-only');
  });
});

describe('settings', () => {
  test('admin updates settings (audited); invalid values are rejected', async () => {
    const r = await admin.patch('/api/admin/settings', {
      retentionMonths: 36,
      resetApprovalOnCriticalChange: true,
    });
    expect(r.body).toMatchObject({ retentionMonths: 36, resetApprovalOnCriticalChange: true });
    expect((await admin.patch('/api/admin/settings', { retentionMonths: 0 })).status).toBe(400);
    expect((await admin.patch('/api/admin/settings', { unknown: 1 })).status).toBe(400);
    const audit = await ctx.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'settings.update'));
    expect(audit[0]!.diff).toMatchObject({ retentionMonths: { to: 36 } });
  });
});

describe('GDPR', () => {
  test('JSON export contains the stored data', async () => {
    const dev = await approvedDev(ctx, { internalNote: 'interne Info' });
    const r = await admin.get(`/api/admin/gdpr/developers/${dev.id}/export?format=json`);
    expect(r.status).toBe(200);
    const data = JSON.parse(new TextDecoder().decode(r.raw));
    expect(data.profile.firstName).toBe('Karim');
    expect(data.profile.internalNote).toBe('interne Info');
    expect(data.statusHistory.length).toBe(3);
    expect(r.headers.get('content-disposition')).toContain('datenauskunft-');
  });

  test('PDF export returns a PDF', async () => {
    const dev = await createDev(egypt);
    const r = await admin.get(`/api/admin/gdpr/developers/${dev.id}/export?format=pdf`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
  });

  test('erasure deletes files and data and redacts the audit trail', async () => {
    const dev = await createDev(egypt);
    const form = new FormData();
    form.set('kind', 'cv');
    form.set('file', new File([PDF_BYTES], 'cv.pdf'));
    await egypt.request('POST', `/api/developers/${dev.id}/documents`, undefined, { form });
    expect(ctx.storage.objects.size).toBe(1);

    const ref = `#${String(dev.publicRef).padStart(3, '0')}`;
    expect(
      (await admin.post(`/api/admin/gdpr/developers/${dev.id}/erase`, { confirm: '#999' })).status,
    ).toBe(400);
    expect(
      (await austria.post(`/api/admin/gdpr/developers/${dev.id}/erase`, { confirm: ref })).status,
    ).toBe(403);
    expect(
      (await admin.post(`/api/admin/gdpr/developers/${dev.id}/erase`, { confirm: ref })).status,
    ).toBe(200);

    expect(ctx.storage.objects.size).toBe(0);
    expect(await ctx.db.select().from(developers).where(eq(developers.id, dev.id))).toHaveLength(0);
    const entries = await ctx.db.select().from(auditLog).where(eq(auditLog.entityId, dev.id));
    const create = entries.find((e) => e.action === 'developer.create')!;
    expect(create.diff).toEqual({ redacted: true });
    expect(JSON.stringify(entries)).not.toContain('Karim');
    expect(entries.some((e) => e.action === 'gdpr.erase')).toBe(true);
  });

  test('restriction blocks editing, PDF and proposals and removes open proposals', async () => {
    const dev = await approvedDev(ctx);
    const catalog = (await austria.get('/api/skills')).body as { id: string; name: string }[];
    const client = await austria.post('/api/clients', { name: 'K' });
    const req = await austria.post('/api/requests', {
      clientId: client.body.id,
      title: 'R',
      seniority: null,
      startBy: null,
      skills: [{ skillId: catalog.find((s) => s.name === 'Java')!.id, minLevel: 3 }],
    });
    await austria.post(`/api/requests/${req.body.id}/proposals`, { developerId: dev.id });

    expect(
      (await admin.post(`/api/admin/gdpr/developers/${dev.id}/restriction`, { restricted: true }))
        .status,
    ).toBe(400);
    const r = await admin.post(`/api/admin/gdpr/developers/${dev.id}/restriction`, {
      restricted: true,
      reason: 'Widerspruch des Kandidaten',
    });
    expect(r.body.processingRestricted).toBe(true);
    expect(r.body.canEdit).toBe(false);

    const cur = (await austria.get(`/api/developers/${dev.id}`)).body;
    const upd = await austria.put(`/api/developers/${dev.id}`, {
      ...completeProfile(),
      version: cur.version,
    });
    expect(upd.status).toBe(403);
    expect(upd.body.code).toBe('PROCESSING_RESTRICTED');
    expect((await austria.get(`/api/developers/${dev.id}/pdf`)).body.code).toBe(
      'PROCESSING_RESTRICTED',
    );
    expect((await austria.get(`/api/requests/${req.body.id}`)).body.proposals).toHaveLength(0);
    expect((await austria.get(`/api/requests/${req.body.id}/matches`)).body).toHaveLength(0);
    expect(
      (await austria.post(`/api/requests/${req.body.id}/proposals`, { developerId: dev.id }))
        .status,
    ).toBe(403);

    const lifted = await admin.post(`/api/admin/gdpr/developers/${dev.id}/restriction`, {
      restricted: false,
    });
    expect(lifted.body.processingRestricted).toBe(false);
  });

  test('retention job flags expired and consent-less profiles (never deletes)', async () => {
    const old = await createDev(egypt, { firstName: 'Alt' });
    const noConsent = await createDev(egypt, {
      firstName: 'Ohne',
      consentGiven: false,
      consentAt: null,
    });
    const fresh = await createDev(egypt, { firstName: 'Neu' });
    await ctx.db.execute(
      sql`update developers set updated_at = now() - interval '30 months' where id = ${old.id}`,
    );
    await ctx.db.execute(
      sql`update developers set created_at = now() - interval '40 days' where id = ${noConsent.id}`,
    );

    const r = await runRetention(ctx.deps);
    expect(r).toMatchObject({ flaggedRetention: 1, flaggedConsent: 1 });
    const rows = await ctx.db.select().from(developers);
    const byId = new Map(rows.map((d) => [d.id, d]));
    expect(byId.get(old.id)!.deletionFlagReason).toBe('retention_expired');
    expect(byId.get(noConsent.id)!.deletionFlagReason).toBe('consent_missing');
    expect(byId.get(fresh.id)!.deletionFlaggedAt).toBeNull();
    expect(rows).toHaveLength(3);

    expect((await admin.get('/api/developers?flagged=true')).body.total).toBe(2);
    const un = await admin.post(`/api/admin/gdpr/developers/${old.id}/unflag`);
    expect(un.body.deletionFlaggedAt).toBeNull();
    // second run does not flag again within the same state for consent profile (already flagged)
    expect((await runRetention(ctx.deps)).flaggedConsent).toBe(0);
  });
});
