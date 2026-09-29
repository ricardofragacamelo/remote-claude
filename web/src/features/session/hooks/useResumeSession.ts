import { useCallback, useEffect, useRef, useState } from 'react';

import { resumeAnswer, resumeSession } from '../services/live-session.service';
import { useOwnedSessionsStore } from '../store/owned-sessions.store';
import { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';

/**
 * How long a resume waits for its answer before the screen gives up on it.
 *
 * The backend always answers — a session, a join or a refusal — so silence means the answer was
 * lost: the socket dropped after the command left, or the server went down with it. Half a minute
 * is longer than any resume takes and short enough that the button does not stay disabled for ever
 * (plan 05, B-26).
 */
export const RESUME_TIMEOUT_MS = 30_000;

/** What the history screen gets to continue a conversation. */
export interface ResumeControl {
  readonly connection: ConnectionStatus;

  /** A resume is in flight and nothing has answered it yet. */
  readonly isResuming: boolean;

  /** Why the last resume was refused — gone, outside the allowlist, the installation full. */
  readonly error: AppError | null;

  resume(): void;
}

/**
 * Continuing a conversation, and learning which live session it became.
 *
 * The session id is the server's to mint, or — when the conversation is already live for this
 * person — the server's to name, so the screen waits for the answer rather than inventing one. The
 * answer arrives as a `session.started`, a `session.attached` or an `error` on the socket, not on
 * the command (see `resumeAnswer`).
 *
 * @param onResumed called once with the live session. It has to be stable across renders, because
 *   the subscription is rebuilt whenever it changes.
 */
export function useResumeSession(
  conversation: { readonly conversationId: string; readonly workspacePath: string } | null,
  onResumed: (sessionId: string) => void,
): ResumeControl {
  const [connection, setConnection] = useState<ConnectionStatus>('idle');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  // Read from the subscription, which outlives the render that set it.
  const inFlight = useRef<string | null>(null);

  useEffect(() => wsClient.onStatus(setConnection), []);

  const conversationId = conversation?.conversationId ?? null;

  useEffect(() => {
    if (conversationId === null) {
      return;
    }

    return wsClient.observe((frame) => {
      const commandId = inFlight.current;

      if (commandId === null) {
        return;
      }

      const answer = resumeAnswer(frame, { conversationId, commandId });

      if (answer === null) {
        return;
      }

      inFlight.current = null;
      setPending(null);

      if (answer.kind === 'refused') {
        setError(answer.error);
        return;
      }

      // A resume lands on the caller's own session — a new one, or the one already live — so it
      // is this browser's to close, and the screen it moves to has to know that already.
      useOwnedSessionsStore.getState().claim(answer.sessionId);
      onResumed(answer.sessionId);
    });
  }, [conversationId, onResumed]);

  // The deadline of the resume in flight: armed when it leaves, cleared by its answer.
  useEffect(() => {
    if (pending === null) {
      return;
    }

    const timer = setTimeout(() => {
      if (inFlight.current !== pending) {
        return;
      }

      inFlight.current = null;
      setPending(null);
      setError(new AppError('RESUME_TIMEOUT', 'session.error.resumeTimeout', pending));
    }, RESUME_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [pending]);

  const resume = useCallback(() => {
    // A second click while the first is in flight sends nothing: the button is disabled while
    // `isResuming` holds, and the ref is what holds when two clicks land inside one frame.
    if (conversation === null || inFlight.current !== null) {
      return;
    }

    const commandId = resumeSession(
      wsClient,
      conversation.workspacePath,
      conversation.conversationId,
    );

    inFlight.current = commandId;
    setPending(commandId);
    setError(null);
  }, [conversation]);

  return { connection, isResuming: pending !== null, error, resume };
}
