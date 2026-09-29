import type { UserId } from '@domain/auth';
import type { NotificationEntry } from '@domain/notification';

/** An entry as the recording left it, and whether it is new. */
export interface RecordedNotification {
  readonly entry: NotificationEntry;
  readonly created: boolean;
}

/** One page of a user's history, newest first. */
export interface NotificationPage {
  readonly entries: readonly NotificationEntry[];
  /** Where the next page starts, or `null` on the last one. Opaque to everybody but this port. */
  readonly nextCursor: string | null;
  readonly unread: number;
}

/**
 * How a user's notification centre is stored and read back ([06 · D-17](../../../../../docs/plans/06-workbench/decisions.md)).
 *
 * Every read and write is scoped by user, in the predicate: an id of somebody else's entry reads,
 * marks and deletes nothing (plan 06, S-168). Recording is **atomic per user** — the entry with the
 * same client id answered instead of a second one, and the history cut back to the ceiling in the
 * same transaction — so two recordings at once never leave a user past it (S-176).
 */
export interface NotificationHistoryRepository {
  /**
   * Keeps an entry, or answers the one already kept under its client id.
   *
   * @param limit how many entries this user keeps; the oldest beyond it go
   */
  record(entry: NotificationEntry, limit: number): Promise<RecordedNotification>;

  /** A page, newest first, starting after `cursor` — or the first page for `null`. */
  page(userId: UserId, cursor: string | null, size: number): Promise<NotificationPage>;

  /** Marks entries read at `at`; one already read keeps the instant it was read. */
  markRead(userId: UserId, ids: readonly string[], at: Date): Promise<void>;

  markAllRead(userId: UserId, at: Date): Promise<void>;

  remove(userId: UserId, id: string): Promise<void>;

  clear(userId: UserId): Promise<void>;

  /**
   * Deletes every entry, of every user, created before `cutoff`.
   *
   * @returns how many went
   */
  purgeCreatedBefore(cutoff: Date): Promise<number>;
}

export const NOTIFICATION_HISTORY_REPOSITORY = Symbol('NotificationHistoryRepository');
