import { describe, expect, test } from 'bun:test';
import { availableEvents, nextStatus, DEVELOPER_STATUSES, STATUS_EVENTS } from '../src';

describe('state machine', () => {
  test('happy path P1 -> submitted -> P2', () => {
    expect(nextStatus('P1_IN_ERFASSUNG', 'submit')).toBe('P1_EINGEREICHT');
    expect(nextStatus('P1_EINGEREICHT', 'approve')).toBe('P2_FREIGEGEBEN');
  });
  test('return goes back to in-progress', () => {
    expect(nextStatus('P1_EINGEREICHT', 'return')).toBe('P1_IN_ERFASSUNG');
  });
  test('demote moves an approved profile back to Pool 1', () => {
    expect(nextStatus('P2_FREIGEGEBEN', 'demote')).toBe('P1_IN_ERFASSUNG');
  });
  test('every other combination is rejected', () => {
    const allowed = new Set([
      'P1_IN_ERFASSUNG:submit',
      'P1_EINGEREICHT:approve',
      'P1_EINGEREICHT:return',
      'P2_FREIGEGEBEN:demote',
    ]);
    for (const s of DEVELOPER_STATUSES)
      for (const e of STATUS_EVENTS)
        if (!allowed.has(`${s}:${e}`)) expect(nextStatus(s, e)).toBeNull();
  });
  test('cannot skip review (approve from in-progress)', () => {
    expect(nextStatus('P1_IN_ERFASSUNG', 'approve')).toBeNull();
  });
  test('availableEvents', () => {
    expect(availableEvents('P1_EINGEREICHT').sort()).toEqual(['approve', 'return']);
  });
});
