import { useEffect, useRef, useState } from 'react';

import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';

/** Where the one socket of the app stands, kept up to date. */
export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('idle');

  useEffect(() => wsClient.onStatus(setStatus), []);

  return status;
}

/** The socket is trying to come back — on its own, or held back after too many attempts. */
export function isReconnecting(status: ConnectionStatus): boolean {
  return status === 'reconnecting' || status === 'throttled';
}

/**
 * Tells `onChange` every time the socket's status changes, with where it was and where it is — what
 * the screens that react to a drop, or to the way back from one, all need.
 *
 * @param onChange has to be stable across renders
 */
export function useConnectionChange(
  onChange: (was: ConnectionStatus, now: ConnectionStatus) => void,
): void {
  const status = useConnectionStatus();
  const previous = useRef(status);

  useEffect(() => {
    const was = previous.current;
    previous.current = status;

    if (was !== status) {
      onChange(was, status);
    }
  }, [onChange, status]);
}
