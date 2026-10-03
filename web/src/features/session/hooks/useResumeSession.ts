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

/** A conversation to continue, and where it ran — a resume runs there too, and nowhere else. */
export interface ResumeTarget {
  readonly conversationId: string;
  readonly workspacePath: string;
}

/** What a screen gets to continue a conversation. */
export interface ResumeControl {
  readonly connection: ConnectionStatus;

  /** A resume is in flight and nothing has answered it yet. */
  readonly isResuming: boolean;

  /** Why the last resume was refused — gone, outside the allowlist, the installation full. */
  readonly error: AppError | null;

  resume(): void;
}

/** Continuing any conversation, named when it is asked for — what a list of them needs. */
export interface Resumer extends Omit<ResumeControl, 'resume'> {
  /** The conversation the resume in flight, or the last one, was for. */
  readonly target: ResumeTarget | null;

  /** @returns whether the resume left — it does not with one in flight, or with the socket down */
  resume(target: ResumeTarget): boolean;
}

/** The resume in flight: the command that asked, and the conversation it asked for. */
interface InFlight {
  readonly commandId: string;
  readonly conversationId: string;
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
export function useResumer(onResumed: (sessionId: string) => void): Resumer {
  const [connection, setConnection] = useState<ConnectionStatus>('idle');
  const [pending, setPending] = useState<InFlight | null>(null);
  const [target, setTarget] = useState<ResumeTarget | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  // Read from the subscription, which outlives the render that set it.
  const inFlight = useRef<InFlight | null>(null);

  useEffect(() => wsClient.onStatus(setConnection), []);

  useEffect(
    () =>
      wsClient.observe((frame) => {
        const asked = inFlight.current;

        if (asked === null) {
          return;
        }

        const answer = resumeAnswer(frame, {
          conversationId: asked.conversationId,
          commandId: asked.commandId,
        });

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
      }),
    [onResumed],
  );

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
      setError(new AppError('RESUME_TIMEOUT', 'session.error.resumeTimeout', pending.commandId));
    }, RESUME_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [pending]);

  const resume = useCallback((next: ResumeTarget) => {
    // A second press while the first is in flight sends nothing (S-45): the button is disabled
    // while `isResuming` holds, and the ref is what holds when two presses land inside one frame.
    if (inFlight.current !== null) {
      return false;
    }

    const commandId = resumeSession(wsClient, next.workspacePath, next.conversationId);

    // The socket was not ready and nothing left: there is nothing to wait for.
    if (commandId === null) {
      return false;
    }

    const asked = { commandId, conversationId: next.conversationId };

    inFlight.current = asked;
    setPending(asked);
    setTarget(next);
    setError(null);
    return true;
  }, []);

  return { connection, isResuming: pending !== null, error, target, resume };
}

/**
 * Continuing **one** conversation — the panel that reads it, with its button.
 *
 * @param conversation the conversation, or `null` while it is not known yet
 */
export function useResumeSession(
  conversation: ResumeTarget | null,
  onResumed: (sessionId: string) => void,
): ResumeControl {
  const resumer = useResumer(onResumed);
  const { resume } = resumer;

  return {
    connection: resumer.connection,
    isResuming: resumer.isResuming,
    error: resumer.error,
    resume: useCallback(() => {
      if (conversation !== null) {
        resume(conversation);
      }
    }, [conversation, resume]),
  };
}
