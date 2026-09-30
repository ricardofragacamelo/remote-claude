import { useCallback } from 'react';

import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { useConnectionStatus } from '@/shared/hooks/useConnectionStatus';

/** Where the socket of the app stands, and whether a person can make it try again now. */
export interface Connection {
  readonly status: ConnectionStatus;

  /** Down, and a "reconnect" would start an attempt now. */
  readonly canReconnect: boolean;

  /** Down, and the server asked to be left alone for a while — "reconnect" waits with it. */
  readonly heldBack: boolean;

  reconnect(): void;
}

/** The states in which there is a connection to come back to. */
const DOWN: readonly ConnectionStatus[] = ['reconnecting', 'closed', 'throttled'];

/**
 * The connection of the app, as Logs and diagnostics shows it: the state, translated, and the way
 * to try again without waiting out the backoff (plan 06, S-200).
 *
 * With the socket up there is nothing to reconnect; held back by the server (`throttled`), the
 * attempt waits for the server's deadline — the button says why instead of doing nothing.
 */
export function useConnection(): Connection {
  const status = useConnectionStatus();

  const reconnect = useCallback(() => {
    wsClient.reconnect();
  }, []);

  return {
    status,
    canReconnect: DOWN.includes(status) && status !== 'throttled',
    heldBack: status === 'throttled',
    reconnect,
  };
}
