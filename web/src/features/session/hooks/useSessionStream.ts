import { useCallback, useEffect, useMemo, useState } from 'react';

import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { sendPing } from '../services/session.service';
import { useSessionStreamStore } from '../store/session-stream.store';
import type { Pong } from '../types/pong';

/** What the screen gets: the stream, where the connection is, and one thing it can do. */
export interface SessionStream {
  readonly status: ConnectionStatus;
  readonly sessionId: string | null;
  readonly pongs: readonly Pong[];
  readonly isSending: boolean;
  ping(): void;
}

/**
 * The live stream of the session on screen.
 *
 * The hook is the only layer that knows both sides: React above, the client below. The component
 * never learns that a socket exists, and the client never learns that React does.
 */
export function useSessionStream(): SessionStream {
  const sessionId = useSessionStreamStore((state) => state.sessionId);
  const pongs = useSessionStreamStore((state) => state.pongs);
  const apply = useSessionStreamStore((state) => state.apply);
  const reset = useSessionStreamStore((state) => state.reset);

  const [status, setStatus] = useState<ConnectionStatus>('idle');

  // What is in flight, rather than a boolean kept in step with an effect: `isSending` is derived
  // from it, so the answer arriving is what ends the wait — no cascading render in between.
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => wsClient.onStatus(setStatus), []);

  // The very first ping opens the session, so its pong arrives before anything could have attached.
  useEffect(() => wsClient.observe(apply), [apply]);

  useEffect(() => {
    if (sessionId === null) {
      return;
    }

    // The detach is mandatory: without it, moving between sessions piles up subscriptions and the
    // screen starts receiving events for a session it no longer shows.
    return wsClient.attach(sessionId, {
      onEvent: apply,
      onGap: reset,
      lastSeq: () => useSessionStreamStore.getState().lastSeq,
    });
  }, [sessionId, apply, reset]);

  const isSending = useMemo(
    () => pending !== null && !pongs.some((pong) => pong.nonce === pending),
    [pending, pongs],
  );

  const ping = useCallback(() => {
    // A second click while the first is in flight sends one command, not two: the button is
    // disabled while `isSending` holds, and a command the socket refused never starts the wait.
    const nonce = crypto.randomUUID();
    setPending(sendPing(wsClient, { sessionId, nonce }) ? nonce : null);
  }, [sessionId]);

  return { status, sessionId, pongs, isSending, ping };
}
