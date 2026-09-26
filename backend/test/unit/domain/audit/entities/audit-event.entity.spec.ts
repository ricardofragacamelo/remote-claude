import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_KINDS, AuditEvent, isAuditEventKind } from '@domain/audit';
import { UserId } from '@domain/auth';

const owner = UserId.create('auth|owner');
const at = new Date('2026-09-18T10:00:00.000Z');

const draft = {
  id: '01J000000000000000000001',
  userId: owner,
  kind: 'device.approved',
  subjectId: 'dev_1',
  subjectLabel: 'Pixel 8',
  at,
} as const;

describe('AuditEvent', () => {
  it('records who, what, about which subject, and when', () => {
    expect(AuditEvent.record(draft).snapshot()).toEqual(draft);
  });

  it('rehydrates to something indistinguishable from what was recorded', () => {
    expect(AuditEvent.restore(draft).snapshot()).toEqual(AuditEvent.record(draft).snapshot());
  });

  it('exposes every field without a setter — a trail the system can rewrite is not a trail', () => {
    const event = AuditEvent.record(draft);

    expect(event.id).toBe(draft.id);
    expect(event.userId).toBe(owner);
    expect(event.kind).toBe('device.approved');
    expect(event.subjectId).toBe('dev_1');
    expect(event.subjectLabel).toBe('Pixel 8');
    expect(event.at).toEqual(at);
  });

  it.each(AUDIT_EVENT_KINDS)('recognises %s as a kind', (kind) => {
    expect(isAuditEventKind(kind)).toBe(true);
  });

  it.each(['', 'device.seen', 'tool.invoked'])('refuses %s as a kind', (raw) => {
    expect(isAuditEventKind(raw)).toBe(false);
  });
});
