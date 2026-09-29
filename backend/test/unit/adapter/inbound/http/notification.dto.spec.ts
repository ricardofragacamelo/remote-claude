import { describe, expect, it } from 'vitest';

import {
  listNotificationsSchema,
  markNotificationsReadSchema,
  recordNotificationSchema,
  toNotificationDto,
} from '@adapter/inbound/http/notification/notification.dto';
import { UserId } from '@domain/auth';
import { NotificationEntry } from '@domain/notification';

const valid = {
  clientId: 'c_1-A',
  severity: 'error',
  messageKey: 'notification.command.failed',
  params: { command: 'workbench.openFolder', code: 'CONFLICT' },
  count: 1,
};

describe('what POST /notifications is sent — plan 06, S-174', () => {
  it('accepts a well-formed notification', () => {
    expect(recordNotificationSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['a client id with a space', { clientId: 'a b' }],
    ['a client id too long', { clientId: 'x'.repeat(65) }],
    ['an unknown severity', { severity: 'loud' }],
    ['a key that is prose', { messageKey: 'The command failed.' }],
    ['a key with one segment', { messageKey: 'failed' }],
    ['a parameter that is a structure', { params: { command: { nested: true } } }],
    ['a parameter name that is not a word', { params: { 'a b': 'x' } }],
    ['a parameter too long', { params: { command: 'x'.repeat(513) } }],
    ['no parameters at all', { params: undefined }],
    ['a count of zero', { count: 0 }],
    ['a count past the ceiling', { count: 10_001 }],
    ['a fractional count', { count: 1.5 }],
    ['a field the contract does not name', { conversation: 'hello' }],
  ])('refuses %s', (_case, change) => {
    expect(recordNotificationSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });

  it('accepts numbers and booleans as parameters', () => {
    expect(
      recordNotificationSchema.safeParse({ ...valid, params: { command: 1, code: true } }).success,
    ).toBe(true);
  });
});

describe('the other notification requests', () => {
  it('takes a cursor of digits, or none', () => {
    expect(listNotificationsSchema.parse({})).toEqual({});
    expect(listNotificationsSchema.parse({ cursor: '42' })).toEqual({ cursor: '42' });
    expect(listNotificationsSchema.safeParse({ cursor: 'abc' }).success).toBe(false);
  });

  it('marks between one and two hundred ids read, and nothing else', () => {
    expect(markNotificationsReadSchema.safeParse({ ids: ['a'] }).success).toBe(true);
    expect(markNotificationsReadSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(
      markNotificationsReadSchema.safeParse({ ids: Array.from({ length: 201 }, () => 'a') })
        .success,
    ).toBe(false);
    expect(markNotificationsReadSchema.safeParse({ ids: ['a'], all: true }).success).toBe(false);
  });
});

describe('the notification DTO', () => {
  const created = new Date('2026-09-28T12:00:00.000Z');
  const entry = NotificationEntry.record(
    {
      userId: UserId.create('auth|owner'),
      clientId: 'c',
      severity: 'error',
      messageKey: 'notification.command.failed',
      params: { command: 'x', code: 'y' },
      count: 2,
    },
    'id-1',
    created,
  );

  it('carries the key and its parameters, never who it belongs to', () => {
    const dto = toNotificationDto(entry);

    expect(dto).toEqual({
      id: 'id-1',
      severity: 'error',
      messageKey: 'notification.command.failed',
      params: { command: 'x', code: 'y' },
      count: 2,
      createdAt: created.toISOString(),
      readAt: null,
    });
    expect(JSON.stringify(dto)).not.toContain('auth|owner');
  });

  it('writes the instant it was read', () => {
    const read = new Date('2026-09-28T13:00:00.000Z');
    const dto = toNotificationDto(NotificationEntry.restore({ ...entry.snapshot(), readAt: read }));

    expect(dto.readAt).toBe(read.toISOString());
  });
});
