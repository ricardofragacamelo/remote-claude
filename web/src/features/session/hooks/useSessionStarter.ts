import { useCallback, useEffect, useState } from 'react';

import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { startSession } from '../services/live-session.service';

/** What the starter gets: whether it can ask, and whether it is waiting. */
export interface SessionStarter {
  readonly connection: ConnectionStatus;

  /** A `session.start` is in flight and `session.started` has not come back. */
  readonly isStarting: boolean;

  start(workspacePath: string): void;
}

/**
 * Opening a session, and waiting to be told its id.
 *
 * The id is the **server's** to mint, so the screen waits for `session.started` rather than
 * inventing one — and that event arrives before anything could have attached to the session it
 * announces, which is why it is observed rather than subscribed to.
 *
 * @param onStarted called once with the id the server minted. It has to be stable across renders,
 *   because the subscription is rebuilt whenever it changes.
 */
export function useSessionStarter(onStarted: (sessionId: string) => void): SessionStarter {
  const [connection, setConnection] = useState<ConnectionStatus>('idle');
  const [isStarting, setStarting] = useState(false);

  useEffect(() => wsClient.onStatus(setConnection), []);

  // Reported from the subscription rather than through a piece of state the component reads back:
  // a component that called its own callback while rendering would call it again on every render.
  useEffect(
    () =>
      wsClient.observe((frame) => {
        const sessionId = frame.payload?.['sessionId'];

        if (frame.type === 'session.started' && typeof sessionId === 'string') {
          setStarting(false);
          onStarted(sessionId);
        }
      }),
    [onStarted],
  );

  const start = useCallback((workspacePath: string) => {
    // A command the socket refused never starts the wait: leaving the button disabled for a
    // command that never left is a screen that looks busy and is not.
    setStarting(startSession(wsClient, workspacePath));
  }, []);

  return { connection, isStarting, start };
}
