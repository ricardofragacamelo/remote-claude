import type {
  NotificationAction,
  NotificationParams,
  NotificationSeverity,
} from '@/shared/lib/notify';

/** One entry of the notification centre, as the server keeps it. */
export interface NotificationEntry {
  readonly id: string;
  readonly severity: NotificationSeverity;
  readonly messageKey: string;
  readonly params: NotificationParams;

  /** How many times it happened in the burst it stands for. */
  readonly count: number;

  /** ISO-8601. */
  readonly createdAt: string;

  /** ISO-8601, or `null` while unread. */
  readonly readAt: string | null;
}

/** A page of the centre, newest first. */
export interface NotificationPage {
  readonly items: readonly NotificationEntry[];
  readonly unread: number;
  readonly nextCursor: string | null;
}

/**
 * Where a notification this window raised stands on its way to the server.
 *
 * - `grouping`: the burst it opened is still gathering the same notification;
 * - `saving`: sent, no answer yet;
 * - `unsaved`: the server could not be reached — it is sent again, under the same client id;
 * - `refused`: the server said no to it, and it is not sent again.
 */
export type PendingState = 'grouping' | 'saving' | 'unsaved' | 'refused';

/** A notification this window raised and the server does not have yet. */
export interface PendingNotification {
  /** This window's own id for it: what makes sending it twice keep one on the server. */
  readonly clientId: string;
  readonly severity: NotificationSeverity;
  readonly messageKey: string;
  readonly params: NotificationParams;
  readonly count: number;
  readonly createdAt: string;
  readonly state: PendingState;
  readonly actions: readonly NotificationAction[];
}
