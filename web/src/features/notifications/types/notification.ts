import type {
  Notification as ContractNotification,
  NotificationPagePayload,
} from '@remote-claude/contracts';

import type {
  NotificationAction,
  NotificationParams,
  NotificationSeverity,
} from '@/shared/lib/notify';

/**
 * One entry of the notification centre, as the server keeps it (`GET /notifications` and friends).
 *
 * `severity` and `params` are narrowed from the contract's open shape to this feature's own, tighter
 * ones: in the domain every parameter is a string, a number or a boolean, which the generator's
 * open-object subset cannot express (plan 28, B-48) — the same narrowing `notify.ts` already does
 * for a notification raised client-side.
 */
export type NotificationEntry = Omit<ContractNotification, 'severity' | 'params'> & {
  readonly severity: NotificationSeverity;
  readonly params: NotificationParams;
};

/** A page of the centre, newest first. */
export type NotificationPage = Omit<NotificationPagePayload, 'items'> & {
  readonly items: readonly NotificationEntry[];
};

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
