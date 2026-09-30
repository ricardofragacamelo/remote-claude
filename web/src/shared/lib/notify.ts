import { logger } from '@/shared/logging/logger';

/** How loud a notification is — the same three the server keeps. */
export const NOTIFICATION_SEVERITIES = ['info', 'warning', 'error'] as const;

export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

/** What a notification may interpolate: a short value, never a structure — as the server takes. */
export type NotificationParams = Readonly<Record<string, string | number | boolean>>;

/** Something the person can do about a notification, from the toast itself. */
export interface NotificationAction {
  /** A translation key, named in full where the action is declared. */
  readonly labelKey: string;
  run(): void;
}

/**
 * One notification, as whoever has something to say hands it over.
 *
 * Text is always a key: the history keeps `severity`, `messageKey` and `params` and **nothing
 * else** — never a piece of a conversation, never a command line
 * (docs/architecture/web/03-ui-system.md#centro-de-notificações).
 */
export interface Notification {
  readonly severity: NotificationSeverity;

  /** One of the catalogue the server keeps (`NOTIFICATION_CATALOGUE`, 06 · D-19). */
  readonly messageKey: string;
  readonly params?: NotificationParams;
  readonly actions?: readonly NotificationAction[];
}

const listeners = new Set<(notification: Notification) => void>();

/**
 * Tells the person something they did not ask about, or that has no place on the screen to say
 * it: a command of the palette that failed, the connection lost and back
 * ([06 · D-17](../../../../docs/plans/06-workbench/decisions.md#d-17--o-que-vira-notificação-e-onde-vive-o-histórico)).
 *
 * **Not** for an error that already has its place — a form, the error state of a list — nor for a
 * permission request, which has its own and stronger flow. A notification sent while nobody listens
 * (nobody is signed in) is dropped, and said so in the log.
 */
export function notify(notification: Notification): void {
  if (listeners.size === 0) {
    logger.debug(
      {
        op: 'notification.dropped',
        severity: notification.severity,
        messageKey: notification.messageKey,
      },
      'notification with nobody to show it',
    );
    return;
  }

  for (const listener of listeners) {
    listener(notification);
  }
}

/**
 * Listens to what {@link notify} is told — the notification centre does, while it is mounted.
 *
 * `shared/` never imports a feature, so the centre comes to the service, not the other way round.
 *
 * @returns the way to stop listening
 */
export function onNotify(listener: (notification: Notification) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
