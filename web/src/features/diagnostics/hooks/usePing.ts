import { useCallback, useEffect, useState } from 'react';

import { toTransportError } from '@/shared/api/errors';
import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { useSessionFrames } from '@/shared/hooks/useSessionFrames';
import { newTraceId } from '@/shared/lib/trace';
import { sendPing } from '../services/ping.service';
import { usePingStore } from '../store/ping.store';
import type { PingRequest } from '../types/ping';

/** What the screen gets: the round trips, the one in flight, and the way to send another. */
export interface Ping {
  readonly sessionId: string | null;

  /** What this browser sent, newest first, each with its answer once it came. */
  readonly requests: readonly PingRequest[];

  /** A ping is on its way: the next one waits for it — a double click sends one (00 · S-110). */
  readonly isSending: boolean;

  /** Why the last ping did not leave — the socket was down — until the next one does. */
  readonly error: AppError | null;

  ping(): void;
}

/**
 * The end-to-end round trip of Logs and diagnostics: one command across every layer, the gateway,
 * the use case, the rule, the database, and back as an event.
 *
 * The hook is the only layer that knows both sides: React above, the client below. A ping asked for
 * while the socket is down does not leave, and says so — `NETWORK_UNREACHABLE`, translated, with the
 * way to reconnect beside it (plan 06, S-140) — rather than a button that silently did nothing.
 */
export function usePing(): Ping {
  const sessionId = usePingStore((state) => state.sessionId);
  const requests = usePingStore((state) => state.requests);
  const apply = usePingStore((state) => state.apply);
  const reset = usePingStore((state) => state.reset);
  const [error, setError] = useState<AppError | null>(null);

  // The very first ping opens the session, so its pong arrives before anything could have attached.
  useEffect(() => wsClient.observe((frame) => apply(frame)), [apply]);

  useSessionFrames(sessionId, {
    apply: (frame) => apply(frame),
    reset,
    lastSeq: () => usePingStore.getState().lastSeq,
  });

  const isSending = requests.some((request) => request.pong === null);

  const ping = useCallback(() => {
    // Read from the store, not from the render: two clicks in the same tick both see the render
    // from before either of them.
    if (usePingStore.getState().requests.some((request) => request.pong === null)) {
      return;
    }

    const nonce = crypto.randomUUID();

    if (sendPing(wsClient, { sessionId: usePingStore.getState().sessionId, nonce })) {
      usePingStore.getState().sent(nonce, Date.now());
      setError(null);
    } else {
      setError(toTransportError(newTraceId()));
    }
  }, []);

  return { sessionId, requests: [...requests].reverse(), isSending, error, ping };
}
