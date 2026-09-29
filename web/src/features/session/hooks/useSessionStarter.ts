import { useCallback, useEffect, useState } from 'react';

import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { startSession } from '../services/live-session.service';
import { useOwnedSessionsStore } from '../store/owned-sessions.store';
import { useCommandRefusal } from './useCommandRefusal';
import type { CommandRefusal } from './useCommandRefusal';

/** What the starter gets: whether it can ask, whether it is waiting, and why it was refused. */
export interface SessionStarter {
  readonly connection: ConnectionStatus;

  /** A `session.start` is in flight and neither `session.started` nor a refusal has come back. */
  readonly isStarting: boolean;

  /**
   * Why the server refused the last start — the machine at its ceiling, typically
   * (`SESSION_LIMIT_REACHED`). Cleared by the next attempt.
   */
  readonly error: CommandRefusal['error'];

  start(workspacePath: string): void;
}

/**
 * Opening a session, and waiting to be told its id — or why not.
 *
 * The id is the **server's** to mint, so the screen waits for `session.started` rather than
 * inventing one — and that event arrives before anything could have attached to the session it
 * announces, which is why it is observed rather than subscribed to.
 *
 * **A refusal ends the wait** (plan 05, S-41). A start the server refused never produces a
 * `session.started`, and a screen that only waited for one sat in "Starting…" for good: the
 * difference between "the app froze" and "this machine is at its limit" is the message. Nothing is
 * retried on its own either — the refusal says what to do, and doing it is the person's call.
 *
 * @param onStarted called once with the id the server minted. It has to be stable across renders,
 *   because the subscription is rebuilt whenever it changes.
 */
export function useSessionStarter(onStarted: (sessionId: string) => void): SessionStarter {
  const [connection, setConnection] = useState<ConnectionStatus>('idle');
  const refusal = useCommandRefusal();
  const { settle, expect } = refusal;

  useEffect(() => wsClient.onStatus(setConnection), []);

  // Reported from the subscription rather than through a piece of state the component reads back:
  // a component that called its own callback while rendering would call it again on every render.
  useEffect(
    () =>
      wsClient.observe((frame) => {
        const sessionId = frame.payload?.['sessionId'];

        if (frame.type === 'session.started' && typeof sessionId === 'string') {
          settle();
          // Claimed here, before the screen that shows it exists: it is this browser's to close.
          useOwnedSessionsStore.getState().claim(sessionId);
          onStarted(sessionId);
        }
      }),
    [onStarted, settle],
  );

  const start = useCallback(
    (workspacePath: string) => {
      // A command the socket refused never starts the wait: leaving the button disabled for a
      // command that never left is a screen that looks busy and is not.
      expect(startSession(wsClient, workspacePath));
    },
    [expect],
  );

  return { connection, isStarting: refusal.isAwaiting, error: refusal.error, start };
}
