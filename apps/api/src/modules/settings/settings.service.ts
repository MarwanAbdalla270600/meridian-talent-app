import { SettingsSchema, type Settings } from '@meridian/shared';
import { settings as settingsTable } from '../../db/schema';
import type { Env } from '../../config/env';
import type { Tx } from '../../db/client';

export function defaultSettings(env: Env): Settings {
  return {
    resetApprovalOnCriticalChange: false,
    retentionMonths: env.RETENTION_MONTHS,
    consentGraceDays: env.CONSENT_GRACE_DAYS,
    currentConsentVersion: '2026-01',
    requireTotpForPrivileged: env.REQUIRE_TOTP_FOR_PRIVILEGED,
  };
}

let cache: { at: number; value: Settings } | null = null;
const TTL_MS = 10_000;

export function clearSettingsCache() {
  cache = null;
}

export async function getSettings(db: Tx, env: Env): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await db.select().from(settingsTable);
  const merged: Record<string, unknown> = { ...defaultSettings(env) };
  for (const r of rows) if (r.key in merged) merged[r.key] = r.value;
  const parsed = SettingsSchema.safeParse(merged);
  const value = parsed.success ? parsed.data : defaultSettings(env);
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSettings(db: Tx, patch: Partial<Settings>): Promise<void> {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
  }
  clearSettingsCache();
}
