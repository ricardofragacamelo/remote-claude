import type { UserId } from '@domain/auth';

import { NotificationRejectedError } from '../errors/notification-rejected.error';
import { problemsOf } from '../services/notification-catalogue';
import type { NotificationParams } from '../services/notification-catalogue';
import type { NotificationSeverity } from '../value-objects/notification-severity.value-object';

/**
 * How many notifications one user keeps. The oldest goes when a new one passes it, in the same
 * transaction, so two arriving together never leave one over (06 · D-17, plan 06 S-170, S-176).
 */
export const NOTIFICATION_HISTORY_LIMIT = 200;

/**
 * How long a notification is kept: thirty days, counted in hours so a change of daylight saving
 * time never makes it 719 or 721 (the same reasoning as the audit floor, 03 · D-21).
 */
export const NOTIFICATION_RETENTION_HOURS = 30 * 24;

/** The persisted shape of an entry, as the mapper on either side sees it. */
export interface NotificationEntrySnapshot {
  readonly id: string;
  readonly userId: UserId;
  /** The client's own id for it — what makes sending it again the same entry. */
  readonly clientId: string;
  readonly severity: NotificationSeverity;
  readonly messageKey: string;
  readonly params: NotificationParams;
  /** How many identical notifications the client grouped into this one before sending it. */
  readonly count: number;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

/** What a new entry is made of — everything but its identity and its reading. */
export type NotificationDraft = Omit<NotificationEntrySnapshot, 'id' | 'createdAt' | 'readAt'>;

/**
 * One entry of a user's notification centre.
 *
 * It carries a key and its parameters and nothing else — never the content of a conversation, never
 * a command — which is the push's rule, and the reason the key has to come from the catalogue.
 * "Read" is the server's: marked on the desktop, it is read on the phone too (06 · D-17).
 */
export class NotificationEntry {
  private constructor(
    readonly id: string,
    readonly userId: UserId,
    readonly clientId: string,
    readonly severity: NotificationSeverity,
    readonly messageKey: string,
    readonly params: NotificationParams,
    readonly count: number,
    readonly createdAt: Date,
    readonly readAt: Date | null,
  ) {}

  /**
   * A new, unread entry.
   *
   * @throws {NotificationRejectedError} a key outside the catalogue, or the wrong parameters
   */
  static record(draft: NotificationDraft, id: string, at: Date): NotificationEntry {
    const problems = problemsOf(draft.messageKey, draft.params);

    if (problems.length > 0) {
      throw new NotificationRejectedError(problems);
    }

    return NotificationEntry.restore({
      ...draft,
      params: { ...draft.params },
      id,
      createdAt: at,
      readAt: null,
    });
  }

  /** Rehydrates an entry the repository read back. */
  static restore(state: NotificationEntrySnapshot): NotificationEntry {
    return new NotificationEntry(
      state.id,
      state.userId,
      state.clientId,
      state.severity,
      state.messageKey,
      state.params,
      state.count,
      state.createdAt,
      state.readAt,
    );
  }

  /** Every field, as a plain object — the parameters above are its only own properties. */
  snapshot(): NotificationEntrySnapshot {
    return { ...this };
  }
}
