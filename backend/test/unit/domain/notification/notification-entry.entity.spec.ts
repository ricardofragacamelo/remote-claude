import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import {
  NOTIFICATION_HISTORY_LIMIT,
  NOTIFICATION_RETENTION_HOURS,
  NotificationEntry,
  NotificationRejectedError,
} from '@domain/notification';
import type { NotificationDraft } from '@domain/notification';

const at = new Date('2026-09-28T12:00:00.000Z');
const draft = (overrides: Partial<NotificationDraft> = {}): NotificationDraft => ({
  userId: UserId.create('auth|owner'),
  clientId: 'client-1',
  severity: 'error',
  messageKey: 'notification.tabs.saveFailed',
  params: { code: 'INTERNAL_ERROR' },
  count: 2,
  ...overrides,
});

describe('NotificationEntry', () => {
  it('records an unread entry, with its identity and instant', () => {
    const entry = NotificationEntry.record(draft(), 'id-1', at);

    expect(entry.snapshot()).toEqual({ ...draft(), id: 'id-1', createdAt: at, readAt: null });
    expect([entry.id, entry.clientId, entry.severity, entry.messageKey, entry.count]).toEqual([
      'id-1',
      'client-1',
      'error',
      'notification.tabs.saveFailed',
      2,
    ]);
    expect(entry.userId.value).toBe('auth|owner');
    expect(entry.params).toEqual({ code: 'INTERNAL_ERROR' });
    expect(entry.createdAt).toEqual(at);
    expect(entry.readAt).toBeNull();
  });

  it('refuses a key outside the catalogue, with every problem — plan 06, S-174', () => {
    let refusal: unknown;

    try {
      NotificationEntry.record(draft({ messageKey: 'made.up.key' }), 'id-1', at);
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toBeInstanceOf(NotificationRejectedError);
    expect((refusal as NotificationRejectedError).details).toEqual([
      { field: 'messageKey', rule: 'notInCatalogue' },
    ]);
    expect((refusal as NotificationRejectedError).code).toBe('INVALID_INPUT');
  });

  it('reads back what it was restored from, read or not', () => {
    const read = new Date('2026-09-28T13:00:00.000Z');
    const entry = NotificationEntry.restore({
      ...draft(),
      id: 'id-2',
      createdAt: at,
      readAt: read,
    });

    expect(entry.readAt).toEqual(read);
  });

  it('keeps two hundred for thirty days, counted in hours', () => {
    expect(NOTIFICATION_HISTORY_LIMIT).toBe(200);
    expect(NOTIFICATION_RETENTION_HOURS).toBe(720);
  });
});
