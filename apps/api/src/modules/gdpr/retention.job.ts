import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { developers } from '../../db/schema';
import type { Deps } from '../../types';
import { writeAudit } from '../audit/audit.service';
import { getSettings } from '../settings/settings.service';

const LOCK_KEY = 74_210_001; // arbitrary constant for pg_try_advisory_lock
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionResult {
  flaggedRetention: number;
  flaggedConsent: number;
  skipped?: boolean;
}

/**
 * Flags (never deletes) profiles for review by an admin:
 *  - `retention_expired`: not updated within the retention period (placed developers excluded)
 *  - `consent_missing`: stored without candidate consent longer than the grace period
 * Uses an advisory lock so that only one API instance runs the job at a time.
 */
export async function runRetention(deps: Deps): Promise<RetentionResult> {
  const { db } = deps;
  return db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ ok: boolean }>(
      sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as ok`,
    );
    if (!lock?.ok) return { flaggedRetention: 0, flaggedConsent: 0, skipped: true };

    const s = await getSettings(tx, deps.env);
    const now = deps.now();
    const retentionCutoff = new Date(now);
    retentionCutoff.setMonth(retentionCutoff.getMonth() - s.retentionMonths);
    const consentCutoff = new Date(now.getTime() - s.consentGraceDays * DAY_MS);

    const base = and(isNull(developers.deletedAt), isNull(developers.deletionFlaggedAt));
    const retention = await tx
      .update(developers)
      .set({ deletionFlaggedAt: now, deletionFlagReason: 'retention_expired' })
      .where(and(base, eq(developers.isPlaced, false), lt(developers.updatedAt, retentionCutoff)))
      .returning({ id: developers.id });
    const consent = await tx
      .update(developers)
      .set({ deletionFlaggedAt: now, deletionFlagReason: 'consent_missing' })
      .where(and(base, eq(developers.consentGiven, false), lt(developers.createdAt, consentCutoff)))
      .returning({ id: developers.id });

    for (const r of retention)
      await writeAudit(tx, null, {
        action: 'gdpr.flagged',
        entity: 'developer',
        entityId: r.id,
        diff: { reason: 'retention_expired' },
      });
    for (const r of consent)
      await writeAudit(tx, null, {
        action: 'gdpr.flagged',
        entity: 'developer',
        entityId: r.id,
        diff: { reason: 'consent_missing' },
      });
    return { flaggedRetention: retention.length, flaggedConsent: consent.length };
  });
}

/** Runs the job shortly after start and then once a day. Returns a stop function. */
export function startRetentionScheduler(deps: Deps): () => void {
  const run = () =>
    runRetention(deps)
      .then((r) => deps.logger.info('retention job finished', { ...r }))
      .catch((err) => deps.logger.error('retention job failed', { error: err }));
  const first = setTimeout(run, 60_000);
  const timer = setInterval(run, DAY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
