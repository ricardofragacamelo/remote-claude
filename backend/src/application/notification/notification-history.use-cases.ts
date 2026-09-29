import type { UserId } from '@domain/auth';
import {
  NOTIFICATION_HISTORY_LIMIT,
  NOTIFICATION_RETENTION_HOURS,
  NotificationEntry,
} from '@domain/notification';
import type { NotificationParams, NotificationSeverity } from '@domain/notification';
import type { Clock, IdGenerator } from '@domain/shared';
import type {
  NotificationHistoryRepository,
  NotificationPage,
  RecordedNotification,
} from './ports/notification-history.repository';

/** How many entries one page of the history carries. */
export const NOTIFICATION_PAGE_SIZE = 50;

/** What the client sends to keep a notification. */
export interface RecordNotificationCommand {
  readonly userId: UserId;
  readonly clientId: string;
  readonly severity: NotificationSeverity;
  readonly messageKey: string;
  readonly params: NotificationParams;
  readonly count: number;
}

/**
 * Keeps a notification in the user's centre.
 *
 * Idempotent by the client's id: a client that never got the answer sends the same entry again,
 * and gets the one already kept — never a second (plan 06, S-169). The catalogue is checked before
 * anything is written (S-174), and the ceiling of 200 is kept in the same transaction (S-170).
 */
export class RecordNotificationUseCase {
  constructor(
    private readonly history: NotificationHistoryRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly limit: number = NOTIFICATION_HISTORY_LIMIT,
  ) {}

  /** @throws {import('@domain/notification').NotificationRejectedError} not in the catalogue */
  async execute(command: RecordNotificationCommand): Promise<RecordedNotification> {
    const entry = NotificationEntry.record(
      {
        userId: command.userId,
        clientId: command.clientId,
        severity: command.severity,
        messageKey: command.messageKey,
        params: command.params,
        count: command.count,
      },
      this.ids.next(),
      this.clock.now(),
    );

    return this.history.record(entry, this.limit);
  }
}

/** A page of the user's centre, newest first, with how many are unread. Only theirs. */
export class ListNotificationsUseCase {
  constructor(private readonly history: NotificationHistoryRepository) {}

  execute(userId: UserId, cursor: string | null): Promise<NotificationPage> {
    return this.history.page(userId, cursor, NOTIFICATION_PAGE_SIZE);
  }
}

/**
 * "Read", on the server — marked on one device, read on every other (plan 06, S-173). Marking what
 * is already read, or an id that is not there, changes nothing (S-172).
 */
export class MarkNotificationsReadUseCase {
  constructor(
    private readonly history: NotificationHistoryRepository,
    private readonly clock: Clock,
  ) {}

  /** @param ids `null` for every entry of the user */
  async execute(userId: UserId, ids: readonly string[] | null): Promise<void> {
    if (ids === null) {
      await this.history.markAllRead(userId, this.clock.now());
    } else {
      await this.history.markRead(userId, ids, this.clock.now());
    }
  }
}

/** Deletes one entry, or every entry — also when there is nothing to delete (plan 06, S-177). */
export class DeleteNotificationsUseCase {
  constructor(private readonly history: NotificationHistoryRepository) {}

  /** @param id `null` for every entry of the user */
  async execute(userId: UserId, id: string | null): Promise<void> {
    if (id === null) {
      await this.history.clear(userId);
    } else {
      await this.history.remove(userId, id);
    }
  }
}

/**
 * Lets go of what is older than thirty days — counted in hours, so the boundary is the same instant
 * on every side of a daylight-saving change (plan 06, S-171).
 */
export class PurgeNotificationsUseCase {
  constructor(
    private readonly history: NotificationHistoryRepository,
    private readonly clock: Clock,
  ) {}

  /** @returns how many entries went */
  execute(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - NOTIFICATION_RETENTION_HOURS * 3_600_000);

    return this.history.purgeCreatedBefore(cutoff);
  }
}
