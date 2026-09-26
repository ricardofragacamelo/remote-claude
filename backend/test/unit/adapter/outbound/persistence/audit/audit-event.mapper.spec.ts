import { describe, expect, it } from 'vitest';

import {
  UnreadableAuditEventRowError,
  toEntity,
  toRow,
} from '@adapter/outbound/persistence/audit/audit-event.mapper';
import { AuditEvent } from '@domain/audit';
import { UserId } from '@domain/auth';

const at = new Date('2026-09-18T10:00:00.000Z');

const row = {
  id: '01J000000000000000000001',
  seq: 12,
  userId: 'auth|owner',
  kind: 'device.approved',
  subjectId: 'dev_1',
  subjectLabel: 'Pixel 8',
  at,
  createdAt: at,
};

const event = AuditEvent.record({
  id: row.id,
  userId: UserId.create('auth|owner'),
  kind: 'device.approved',
  subjectId: 'dev_1',
  subjectLabel: 'Pixel 8',
  at,
});

describe('the audit event mapper', () => {
  it('reads a row back as the event it was', () => {
    expect(toEntity(row).snapshot()).toEqual(event.snapshot());
  });

  // No `updatedAt`: the table refuses updates, so a column for one would be a column that lies.
  it('writes an event without any notion of being changed later', () => {
    expect(toRow(event)).toEqual({
      id: row.id,
      userId: 'auth|owner',
      kind: 'device.approved',
      subjectId: 'dev_1',
      subjectLabel: 'Pixel 8',
      at,
    });
  });

  it('refuses a kind this build does not know', () => {
    expect(() => toEntity({ ...row, kind: 'device.borrowed' })).toThrow(
      UnreadableAuditEventRowError,
    );
  });
});
