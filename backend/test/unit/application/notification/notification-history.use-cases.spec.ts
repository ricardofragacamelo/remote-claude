import { beforeEach, describe, expect, it } from 'vitest';

import {
  DeleteNotificationsUseCase,
  ListNotificationsUseCase,
  MarkNotificationsReadUseCase,
  NOTIFICATION_PAGE_SIZE,
  PurgeNotificationsUseCase,
  RecordNotificationUseCase,
} from '@application/notification';
import type { RecordNotificationCommand } from '@application/notification';
import { UserId } from '@domain/auth';
import { NotificationEntry, NotificationRejectedError } from '@domain/notification';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryNotificationHistoryRepository } from '../../../support/fakes/in-memory-notification-history.repository';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const at = new Date('2026-09-28T12:00:00.000Z');
const hours = (count: number) => count * 3_600_000;

const command = (
  overrides: Partial<RecordNotificationCommand> = {},
): RecordNotificationCommand => ({
  userId: owner,
  clientId: 'client-1',
  severity: 'warning',
  messageKey: 'notification.connection.lost',
  params: {},
  count: 1,
  ...overrides,
});

describe('the notification history', () => {
  let history: InMemoryNotificationHistoryRepository;
  let clock: FixedClock;
  let record: RecordNotificationUseCase;

  beforeEach(() => {
    history = new InMemoryNotificationHistoryRepository();
    clock = new FixedClock(at);
    record = new RecordNotificationUseCase(history, clock, new SequentialIds());
  });

  describe('RecordNotificationUseCase', () => {
    it('keeps an entry, unread, at the instant of the clock — plan 06, S-167', async () => {
      const recorded = await record.execute(command());

      expect(recorded.created).toBe(true);
      expect(recorded.entry.snapshot()).toMatchObject({ createdAt: at, readAt: null });
    });

    it('answers the entry already kept for the same client id — S-169', async () => {
      const first = await record.execute(command());
      const again = await record.execute(command());

      expect(again.created).toBe(false);
      expect(again.entry.id).toBe(first.entry.id);
      expect(history.entries).toHaveLength(1);
    });

    it('refuses a key outside the catalogue and keeps nothing — S-174', async () => {
      await expect(record.execute(command({ messageKey: 'made.up.key' }))).rejects.toThrow(
        NotificationRejectedError,
      );
      expect(history.entries).toEqual([]);
    });

    it('lets the oldest go past the ceiling — S-170', async () => {
      const small = new RecordNotificationUseCase(history, clock, new SequentialIds(), 2);

      for (const clientId of ['a', 'b', 'c']) {
        await small.execute(command({ clientId }));
      }

      expect(history.entries.map((entry) => entry.clientId)).toEqual(['b', 'c']);
    });
  });

  describe('ListNotificationsUseCase', () => {
    it('answers a page of this user only, newest first, with the unread count — S-167, S-168', async () => {
      await record.execute(command({ clientId: 'old' }));
      await record.execute(command({ clientId: 'new' }));
      await record.execute(command({ clientId: 'theirs', userId: stranger }));

      const page = await new ListNotificationsUseCase(history).execute(owner, null);

      expect(page.entries.map((entry) => entry.clientId)).toEqual(['new', 'old']);
      expect(page.unread).toBe(2);
      expect(page.nextCursor).toBeNull();
    });

    it('pages at fifty', () => {
      expect(NOTIFICATION_PAGE_SIZE).toBe(50);
    });
  });

  describe('MarkNotificationsReadUseCase — S-172, S-173', () => {
    it('marks the named entries read, and nothing of somebody else', async () => {
      const mine = await record.execute(command({ clientId: 'a' }));
      const theirs = await record.execute(command({ clientId: 'b', userId: stranger }));

      await new MarkNotificationsReadUseCase(history, clock).execute(owner, [
        mine.entry.id,
        theirs.entry.id,
        'not-there',
      ]);

      expect(history.entries.map((entry) => entry.readAt)).toEqual([at, null]);
    });

    it('keeps the instant an entry was first read', async () => {
      const entry = await record.execute(command());
      const mark = new MarkNotificationsReadUseCase(history, clock);

      await mark.execute(owner, [entry.entry.id]);
      clock.advance(60_000);
      await mark.execute(owner, [entry.entry.id]);

      expect(history.entries[0]?.readAt).toEqual(at);
    });

    it('marks every entry of the user at once', async () => {
      await record.execute(command({ clientId: 'a' }));
      await record.execute(command({ clientId: 'b' }));

      await new MarkNotificationsReadUseCase(history, clock).execute(owner, null);

      expect(history.entries.every((entry) => entry.readAt !== null)).toBe(true);
    });
  });

  describe('DeleteNotificationsUseCase — S-177', () => {
    it('deletes one entry, and nothing for an id that is not there', async () => {
      const kept = await record.execute(command({ clientId: 'a' }));
      await record.execute(command({ clientId: 'b' }));
      const doomed = history.entries[1] as NotificationEntry;

      await new DeleteNotificationsUseCase(history).execute(owner, doomed.id);
      await new DeleteNotificationsUseCase(history).execute(owner, 'not-there');

      expect(history.entries.map((entry) => entry.id)).toEqual([kept.entry.id]);
    });

    it('clears every entry of the user and only theirs', async () => {
      await record.execute(command({ clientId: 'a' }));
      await record.execute(command({ clientId: 'b', userId: stranger }));

      await new DeleteNotificationsUseCase(history).execute(owner, null);

      expect(history.entries.map((entry) => entry.userId.value)).toEqual([stranger.value]);
    });
  });

  describe('PurgeNotificationsUseCase — S-171', () => {
    it('removes what is past thirty days by a second, and keeps what is a second short of it', async () => {
      await record.execute(command({ clientId: 'too-old' }));
      clock.advance(2_000);
      await record.execute(command({ clientId: 'just-in' }));
      clock.set(new Date(at.getTime() + hours(720) + 1_000));

      const removed = await new PurgeNotificationsUseCase(history, clock).execute();

      expect(removed).toBe(1);
      expect(history.entries.map((entry) => entry.clientId)).toEqual(['just-in']);
    });
  });
});
