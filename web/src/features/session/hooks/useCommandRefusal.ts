import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { refusalOf } from '../services/live-session.service';

/** One command sent, and whether the server refused it. */
export interface CommandRefusal {
  /** Why the last command was refused. Cleared when the next one leaves. */
  readonly error: AppError | null;

  /** A command left and nothing has settled it yet — neither a refusal nor its outcome. */
  readonly isAwaiting: boolean;

  /**
   * Starts listening for the refusal of the command that just left.
   *
   * @param commandId the id `wsClient.issue` answered, or `null` when nothing left
   */
  expect(commandId: string | null): void;

  /** Whether a command is awaiting right now — read from the ref, so two clicks in one frame agree. */
  inFlight(): boolean;

  /** The outcome arrived some other way — as an event — so there is no refusal left to wait for. */
  settle(): void;
}

/**
 * The refusal of **my** command, among everything else on the socket.
 *
 * A refusal is an `error` frame whose `correlationId` is the id of the command it refuses, and the
 * socket carries every other refusal too — the other tab's, the other feature's. The id is read
 * from a ref, because the subscription outlives the render that set it.
 */
export function useCommandRefusal(): CommandRefusal {
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const inFlight = useRef<string | null>(null);

  useEffect(
    () =>
      wsClient.observe((frame) => {
        const commandId = inFlight.current;
        const refusal = commandId === null ? null : refusalOf(frame, commandId);

        if (refusal !== null) {
          inFlight.current = null;
          setAwaiting(null);
          setError(refusal);
        }
      }),
    [],
  );

  const expect = useCallback((commandId: string | null) => {
    inFlight.current = commandId;
    setAwaiting(commandId);
    setError(null);
  }, []);

  const settle = useCallback(() => {
    inFlight.current = null;
    setAwaiting(null);
  }, []);

  const isInFlight = useCallback(() => inFlight.current !== null, []);

  return { error, isAwaiting: awaiting !== null, expect, inFlight: isInFlight, settle };
}
