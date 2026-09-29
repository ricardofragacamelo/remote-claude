import { describe, expect, it } from 'vitest';

import {
  toEntity,
  toRow,
} from '@adapter/outbound/persistence/notification/notification-entry.mapper';
import { UserId } from '@domain/auth';
import { NotificationEntry } from '@domain/notification';

const at = new Date('2026-09-28T12:00:00.000Z');
const now = new Date('2026-09-28T13:00:00.000Z');

const entry = NotificationEntry.record(
  {
    userId: UserId.create('auth|owner'),
    clientId: 'client-1',
    severity: 'info',
    messageKey: 'notification.command.failed',
    params: { command: 'workbench.openFolder', code: 'CONFLICT' },
    count: 2,
  },
  '01J00000000000000000000001',
  at,
);

describe('the notification entry mapper', () => {
  it('turns an entity into a row and back without losing anything', () => {
    const row = toRow(entry, now);

    expect(row).toMatchObject({ id: entry.id, userId: 'auth|owner', updatedAt: now, readAt: null });
    expect(toEntity({ ...row, seq: 1, readAt: null, updatedAt: now }).snapshot()).toEqual(
      entry.snapshot(),
    );
  });

  it('reads a severity nobody knows as an error — the reading that hides nothing', () => {
    const row = { ...toRow(entry, now), seq: 1, readAt: null, updatedAt: now, severity: 'loud' };

    expect(toEntity(row).severity).toBe('error');
  });
});
