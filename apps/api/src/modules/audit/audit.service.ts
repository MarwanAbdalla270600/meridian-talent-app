import { auditLog } from '../../db/schema';
import type { Tx } from '../../db/client';
import type { Actor } from '../../types';

export interface AuditEntryInput {
  action: string;
  entity: string;
  entityId?: string | null;
  diff?: unknown;
}

/** Appends an audit entry (inside the caller's transaction where possible). */
export async function writeAudit(tx: Tx, actor: Actor | null, e: AuditEntryInput): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: actor?.id ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    diff: e.diff === undefined ? null : (e.diff as object),
    ip: actor?.ip ?? null,
  });
}

export type FieldDiff = Record<string, { from: unknown; to: unknown }>;

/** Field-level diff of two flat-ish objects (arrays/objects compared structurally). */
export function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff {
  const out: FieldDiff = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k] ?? null;
    const b = after[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a, to: b };
  }
  return out;
}
