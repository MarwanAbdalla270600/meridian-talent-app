import { permissionsOf, type Me } from '@meridian/shared';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import * as OTPAuth from 'otpauth';
import { passwordResetTokens, sessions, users } from '../../db/schema';
import { decryptSecret, encryptSecret, hashToken, randomToken } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { hashPassword, passwordWeakness, verifyPassword } from '../../lib/passwords';
import type { Actor, AuthUser, Deps, SessionInfo } from '../../types';
import { writeAudit } from '../audit/audit.service';
import { getSettings } from '../settings/settings.service';

type UserRow = typeof users.$inferSelect;

const PRIVILEGED = new Set(['austria_reviewer', 'admin']);
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const INVITE_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;
const LAST_SEEN_THROTTLE_MS = 60 * 1000;

let dummyHash: Promise<string> | null = null;
/** Verifies against a dummy hash for unknown users to keep timing uniform. */
const burnTime = (password: string) => {
  dummyHash ??= hashPassword('dummy-password-for-timing-0000');
  return dummyHash.then((h) => verifyPassword(password, h));
};

export const toAuthUser = (u: UserRow): AuthUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  role: u.role,
  locale: u.locale,
  totpEnabled: u.totpEnabled,
});

export function toMe(deps: Deps, user: AuthUser, session: SessionInfo): Me {
  return {
    ...user,
    mustEnrollTotp: session.mustEnrollTotp,
    permissions: permissionsOf(user.role),
    features: { cvAiImport: deps.env.FEATURE_CV_AI_IMPORT && !!deps.extractor },
  };
}

function totpFor(secret: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: 'Meridian Talent',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

function verifyTotp(deps: Deps, u: UserRow, code: string): boolean {
  if (!u.totpSecret) return false;
  const secret = decryptSecret(u.totpSecret, deps.env.DATA_ENCRYPTION_KEY);
  return totpFor(secret, u.email).validate({ token: code, window: 1 }) !== null;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
  session: SessionInfo;
}

export async function login(
  deps: Deps,
  input: { email: string; password: string; totp?: string | undefined },
  meta: { ip: string | null; userAgent: string | null; previousToken?: string | undefined },
): Promise<LoginResult> {
  const { db, env } = deps;
  const now = deps.now();
  const [u] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${input.email})`)
    .limit(1);

  if (!u || !u.passwordHash || !u.isActive) {
    await burnTime(input.password);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid e-mail or password');
  }
  if (u.lockedUntil && u.lockedUntil > now) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Account temporarily locked', {
      lockedUntil: u.lockedUntil.toISOString(),
    });
  }

  const fail = async (code: 'INVALID_CREDENTIALS' | 'TOTP_INVALID') => {
    const count = u.failedLoginCount + 1;
    const lock = count >= env.LOGIN_MAX_FAILED;
    await db
      .update(users)
      .set({
        failedLoginCount: lock ? 0 : count,
        lockedUntil: lock
          ? new Date(now.getTime() + env.LOGIN_LOCK_MINUTES * 60_000)
          : u.lockedUntil,
      })
      .where(eq(users.id, u.id));
    await writeAudit(
      db,
      { id: u.id, role: u.role, ip: meta.ip },
      {
        action: lock ? 'auth.locked' : 'auth.login_failed',
        entity: 'user',
        entityId: u.id,
      },
    );
    throw new AppError(
      401,
      code,
      code === 'TOTP_INVALID' ? 'Invalid 2FA code' : 'Invalid e-mail or password',
    );
  };

  if (!(await verifyPassword(input.password, u.passwordHash))) return fail('INVALID_CREDENTIALS');

  if (u.totpEnabled) {
    if (!input.totp) throw new AppError(401, 'TOTP_REQUIRED', '2FA code required');
    if (!verifyTotp(deps, u, input.totp)) return fail('TOTP_INVALID');
  }

  const settings = await getSettings(db, env);
  const mustEnrollTotp =
    settings.requireTotpForPrivileged && PRIVILEGED.has(u.role) && !u.totpEnabled;

  const token = randomToken(32);
  const sessionId = await db.transaction(async (tx) => {
    // Session rotation: an existing session presented with the login is invalidated.
    if (meta.previousToken)
      await tx.delete(sessions).where(eq(sessions.tokenHash, hashToken(meta.previousToken)));
    const [s] = await tx
      .insert(sessions)
      .values({
        userId: u.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + env.SESSION_TTL_HOURS * 3_600_000),
        lastSeenAt: now,
        mustEnrollTotp,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      })
      .returning({ id: sessions.id });
    await tx
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now })
      .where(eq(users.id, u.id));
    await writeAudit(
      tx,
      { id: u.id, role: u.role, ip: meta.ip },
      { action: 'auth.login', entity: 'user', entityId: u.id },
    );
    // Opportunistic cleanup of expired sessions.
    await tx.delete(sessions).where(lt(sessions.expiresAt, now));
    return s!.id;
  });

  return { token, user: toAuthUser(u), session: { id: sessionId, mustEnrollTotp } };
}

/** Resolves a session cookie token; enforces absolute and idle expiry. */
export async function resolveSession(
  deps: Deps,
  token: string,
): Promise<{ user: AuthUser; session: SessionInfo } | null> {
  const now = deps.now();
  const [row] = await deps.db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || !row.u.isActive) return null;
  if (row.s.lastSeenAt.getTime() < now.getTime() - deps.env.SESSION_IDLE_MINUTES * 60_000) {
    await deps.db.delete(sessions).where(eq(sessions.id, row.s.id));
    return null;
  }
  if (now.getTime() - row.s.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await deps.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.s.id));
  }
  return {
    user: toAuthUser(row.u),
    session: { id: row.s.id, mustEnrollTotp: row.s.mustEnrollTotp },
  };
}

export async function logout(deps: Deps, sessionId: string, actor: Actor) {
  await deps.db.delete(sessions).where(eq(sessions.id, sessionId));
  await writeAudit(deps.db, actor, { action: 'auth.logout', entity: 'user', entityId: actor.id });
}

export async function logoutAll(deps: Deps, userId: string, actor: Actor | null) {
  await deps.db.delete(sessions).where(eq(sessions.userId, userId));
  await writeAudit(deps.db, actor, { action: 'auth.logout_all', entity: 'user', entityId: userId });
}

function assertStrong(password: string, context: string[]) {
  const reason = passwordWeakness(password, context);
  if (reason)
    throw new AppError(400, 'WEAK_PASSWORD', 'Password does not meet the requirements', { reason });
}

export async function changePassword(
  deps: Deps,
  actor: Actor,
  current: string,
  next: string,
  keepSessionId: string,
) {
  const [u] = await deps.db.select().from(users).where(eq(users.id, actor.id));
  if (!u?.passwordHash || !(await verifyPassword(current, u.passwordHash))) {
    throw new AppError(400, 'INVALID_CREDENTIALS', 'Current password is wrong');
  }
  assertStrong(next, [u.email, u.displayName]);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash: await hashPassword(next) })
      .where(eq(users.id, u.id));
    // Other sessions are terminated after a password change.
    await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, u.id), sql`${sessions.id} <> ${keepSessionId}`));
    await writeAudit(tx, actor, {
      action: 'auth.password_changed',
      entity: 'user',
      entityId: u.id,
    });
  });
}

/** Creates a one-time link (reset or invite) and e-mails it. */
export async function sendPasswordLink(
  deps: Deps,
  u: UserRow,
  kind: 'reset' | 'invite',
  actor: Actor | null,
) {
  const token = randomToken(32);
  const ttl = kind === 'invite' ? INVITE_TOKEN_TTL_MS : RESET_TOKEN_TTL_MS;
  await deps.db.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: deps.now() })
      .where(and(eq(passwordResetTokens.userId, u.id), isNull(passwordResetTokens.usedAt)));
    await tx.insert(passwordResetTokens).values({
      userId: u.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(deps.now().getTime() + ttl),
    });
    await writeAudit(tx, actor, {
      action: `auth.password_link_${kind}`,
      entity: 'user',
      entityId: u.id,
    });
  });
  const link = `${deps.env.BASE_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  const de = u.locale === 'de';
  const hours = Math.round(ttl / 3_600_000);
  const subject =
    kind === 'invite'
      ? de
        ? 'Ihr Zugang zum Meridian Talent-System'
        : 'Your access to the Meridian Talent system'
      : de
        ? 'Passwort zurücksetzen'
        : 'Reset your password';
  const text = de
    ? `Hallo ${u.displayName},\n\nüber diesen einmaligen Link können Sie ein neues Passwort festlegen (gültig ${hours} Stunden):\n\n${link}\n\nWenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.\n\nMeridian Talent`
    : `Hello ${u.displayName},\n\nuse this one-time link to set a new password (valid for ${hours} hours):\n\n${link}\n\nIf you did not request this, please ignore this e-mail.\n\nMeridian Talent`;
  await deps.mailer.send({ to: u.email, subject, text });
}

/** Always succeeds from the caller's perspective (no account enumeration). */
export async function requestPasswordReset(deps: Deps, email: string) {
  const [u] = await deps.db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  if (!u || !u.isActive) return;
  await sendPasswordLink(deps, u, 'reset', null);
}

export async function resetPassword(
  deps: Deps,
  token: string,
  newPassword: string,
  ip: string | null,
) {
  const now = deps.now();
  const [row] = await deps.db
    .select({ t: passwordResetTokens, u: users })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row || !row.u.isActive) throw new AppError(400, 'TOKEN_INVALID', 'Link invalid or expired');
  assertStrong(newPassword, [row.u.email, row.u.displayName]);
  const hash = await hashPassword(newPassword);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, row.t.id));
    await tx
      .update(users)
      .set({ passwordHash: hash, failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, row.u.id));
    await tx.delete(sessions).where(eq(sessions.userId, row.u.id));
    await writeAudit(
      tx,
      { id: row.u.id, role: row.u.role, ip },
      { action: 'auth.password_reset', entity: 'user', entityId: row.u.id },
    );
  });
}

/* ---------------------------------- TOTP ---------------------------------- */

export async function totpSetup(deps: Deps, actor: Actor) {
  const [u] = await deps.db.select().from(users).where(eq(users.id, actor.id));
  if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (u.totpEnabled) throw new AppError(409, 'CONFLICT', '2FA already enabled');
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  await deps.db
    .update(users)
    .set({ totpSecret: encryptSecret(secret, deps.env.DATA_ENCRYPTION_KEY) })
    .where(eq(users.id, u.id));
  return { secret, otpauthUrl: totpFor(secret, u.email).toString() };
}

export async function totpEnable(deps: Deps, actor: Actor, code: string) {
  const [u] = await deps.db.select().from(users).where(eq(users.id, actor.id));
  if (!u || !u.totpSecret) throw new AppError(400, 'BAD_REQUEST', 'Run setup first');
  if (!verifyTotp(deps, u, code)) throw new AppError(400, 'TOTP_INVALID', 'Invalid 2FA code');
  await deps.db.transaction(async (tx) => {
    await tx.update(users).set({ totpEnabled: true }).where(eq(users.id, u.id));
    await tx.update(sessions).set({ mustEnrollTotp: false }).where(eq(sessions.userId, u.id));
    await writeAudit(tx, actor, { action: 'auth.totp_enabled', entity: 'user', entityId: u.id });
  });
}

export async function totpDisable(deps: Deps, actor: Actor, code: string) {
  const [u] = await deps.db.select().from(users).where(eq(users.id, actor.id));
  if (!u || !u.totpEnabled) throw new AppError(400, 'BAD_REQUEST', '2FA not enabled');
  const settings = await getSettings(deps.db, deps.env);
  if (settings.requireTotpForPrivileged && PRIVILEGED.has(u.role)) {
    throw new AppError(403, 'FORBIDDEN', '2FA is mandatory for this role');
  }
  if (!verifyTotp(deps, u, code)) throw new AppError(400, 'TOTP_INVALID', 'Invalid 2FA code');
  await deps.db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null })
    .where(eq(users.id, u.id));
  await writeAudit(deps.db, actor, {
    action: 'auth.totp_disabled',
    entity: 'user',
    entityId: u.id,
  });
}

export { assertStrong };
