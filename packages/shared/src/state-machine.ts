import type { DeveloperStatus, StatusEvent } from './enums';

/**
 * Two-phase workflow (server-enforced):
 *
 *   P1_IN_ERFASSUNG --submit--> P1_EINGEREICHT --approve--> P2_FREIGEGEBEN
 *         ^                          |                          |
 *         +------- return (note) ----+                          |
 *         +------------------- demote (Austria only) -----------+
 */
const TRANSITIONS: Record<StatusEvent, { from: DeveloperStatus; to: DeveloperStatus }> = {
  submit: { from: 'P1_IN_ERFASSUNG', to: 'P1_EINGEREICHT' },
  approve: { from: 'P1_EINGEREICHT', to: 'P2_FREIGEGEBEN' },
  return: { from: 'P1_EINGEREICHT', to: 'P1_IN_ERFASSUNG' },
  demote: { from: 'P2_FREIGEGEBEN', to: 'P1_IN_ERFASSUNG' },
};

/** Returns the target status, or `null` when the event is not allowed from `from`. */
export function nextStatus(from: DeveloperStatus, event: StatusEvent): DeveloperStatus | null {
  const t = TRANSITIONS[event];
  return t.from === from ? t.to : null;
}

/** Events that are structurally possible from the given status (ignores roles). */
export function availableEvents(from: DeveloperStatus): StatusEvent[] {
  return (Object.keys(TRANSITIONS) as StatusEvent[]).filter((e) => TRANSITIONS[e].from === from);
}

/** Events that require the checklist to be complete. */
export const CHECKLIST_GATED_EVENTS: readonly StatusEvent[] = ['submit', 'approve'];

/** Events that require a non-empty note. */
export const NOTE_REQUIRED_EVENTS: readonly StatusEvent[] = ['return'];
