import { AppError } from '@/shared/api/errors';
import type { Notification } from '@/shared/lib/notify';
import { logger } from '@/shared/logging/logger';
import type { NotificationEntry, PendingNotification } from '../types/notification';

/** How long a burst gathers the same notification before the one entry for it is sent. */
export const BURST_MS = 1_500;

/** How long to wait before each new attempt to keep an entry the server could not be asked about. */
export const RETRY_MS: readonly [number, ...number[]] = [2_000, 5_000, 15_000, 30_000, 60_000];

/** Waits, and answers the way to stop waiting. */
export type Schedule = (action: () => void, ms: number) => () => void;

const wait: Schedule = (action, ms) => {
  const timer = setTimeout(action, ms);
  return () => {
    clearTimeout(timer);
  };
};

export interface OutboxDependencies {
  /** Keeps an entry on the server. The same client id twice keeps one. */
  send(pending: PendingNotification): Promise<NotificationEntry>;

  /** What this window has raised and the server does not have yet — for the centre to list. */
  onChange(pending: readonly PendingNotification[]): void;

  /** The server kept it: from now on the entry is the server's. */
  onSaved(entry: NotificationEntry): void;
  readonly schedule?: Schedule;
  now?(): Date;
  newId?(): string;
}

export interface Outbox {
  /**
   * Takes a notification in: a new entry, or — when the same one is still gathering its burst — one
   * more on that entry's count.
   *
   * @returns the entry it counts in, as it is now
   */
  add(notification: Notification): PendingNotification;

  /** Forgets an entry the person cleared before the server had it: it is not sent again. */
  drop(clientId: string): void;

  /** Sends now what is waiting for another attempt — the connection just came back. */
  retryNow(): void;

  /** Stops every timer and forgets everything — the person signed out. */
  dispose(): void;
}

/** Same severity, key and parameters: the same notification, however often it is raised. */
function sameAs(notification: Notification): (pending: PendingNotification) => boolean {
  const params = JSON.stringify(Object.entries(notification.params ?? {}).sort());

  return (pending) =>
    pending.state === 'grouping' &&
    pending.severity === notification.severity &&
    pending.messageKey === notification.messageKey &&
    JSON.stringify(Object.entries(pending.params).sort()) === params;
}

/**
 * A refusal the server would give again: a key or a parameter outside its catalogue. Anything else
 * — the network, a server that was restarting — is worth another attempt.
 */
function isFinal(error: unknown): boolean {
  return error instanceof AppError && error.code === 'INVALID_INPUT';
}

/**
 * Where a notification waits between being raised and being kept on the server.
 *
 * - A burst of the same notification is **one** entry with a count, sent once when the burst is
 *   over — one write, not one per repetition (plan 06, S-132).
 * - An entry the server could not be asked about stays — in the centre, and its toast is already
 *   shown — and is sent again later **under the same client id**, which the server answers with the
 *   one it may already have kept: nothing is lost, nothing doubles (S-182).
 */
export function createOutbox(dependencies: OutboxDependencies): Outbox {
  const schedule = dependencies.schedule ?? wait;
  const now = dependencies.now ?? (() => new Date());
  const newId = dependencies.newId ?? (() => globalThis.crypto.randomUUID());
  let pending: readonly PendingNotification[] = [];
  const timers = new Map<string, () => void>();
  const attempts = new Map<string, number>();
  let disposed = false;

  const publish = (next: readonly PendingNotification[]): void => {
    pending = next;
    dependencies.onChange(pending);
  };

  const update = (clientId: string, change: Partial<PendingNotification>): void => {
    publish(pending.map((each) => (each.clientId === clientId ? { ...each, ...change } : each)));
  };

  const forget = (clientId: string): void => {
    timers.get(clientId)?.();
    timers.delete(clientId);
    attempts.delete(clientId);
    publish(pending.filter((each) => each.clientId !== clientId));
  };

  const later = (clientId: string, ms: number): void => {
    timers.set(
      clientId,
      schedule(() => {
        timers.delete(clientId);
        send(clientId);
      }, ms),
    );
  };

  function send(clientId: string): void {
    const entry = pending.find((each) => each.clientId === clientId);

    if (entry === undefined) {
      return;
    }

    update(clientId, { state: 'saving' });

    dependencies.send({ ...entry, state: 'saving' }).then(
      (kept) => {
        // Signed out meanwhile: the entry is the server's, and nobody here is left to be told.
        if (disposed) {
          return;
        }

        forget(clientId);
        dependencies.onSaved(kept);
      },
      (error: unknown) => {
        if (disposed || !pending.some((each) => each.clientId === clientId)) {
          return;
        }

        if (isFinal(error)) {
          logger.warn(
            { op: 'notification.record', messageKey: entry.messageKey, outcome: 'refused' },
            'the server refused a notification — kept in this window only',
          );
          update(clientId, { state: 'refused' });
          return;
        }

        const attempt = (attempts.get(clientId) ?? 0) + 1;
        attempts.set(clientId, attempt);
        update(clientId, { state: 'unsaved' });
        later(clientId, RETRY_MS[Math.min(attempt, RETRY_MS.length) - 1] ?? RETRY_MS[0]);
      },
    );
  }

  return {
    add(notification) {
      const burst = pending.find(sameAs(notification));

      if (burst !== undefined) {
        update(burst.clientId, { count: burst.count + 1 });
        return pending.find((each) => each.clientId === burst.clientId) ?? burst;
      }

      const created: PendingNotification = {
        clientId: newId(),
        severity: notification.severity,
        messageKey: notification.messageKey,
        params: notification.params ?? {},
        count: 1,
        createdAt: now().toISOString(),
        state: 'grouping',
        actions: notification.actions ?? [],
      };

      publish([created, ...pending]);
      later(created.clientId, BURST_MS);
      return created;
    },

    drop: forget,

    retryNow() {
      for (const entry of pending.filter((each) => each.state === 'unsaved')) {
        timers.get(entry.clientId)?.();
        timers.delete(entry.clientId);
        send(entry.clientId);
      }
    },

    dispose() {
      disposed = true;
      for (const stop of timers.values()) {
        stop();
      }
      timers.clear();
      attempts.clear();
      publish([]);
    },
  };
}
