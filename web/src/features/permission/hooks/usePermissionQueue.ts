import { useCallback, useEffect, useState } from 'react';

import { wsClient } from '@/shared/api/ws';
import { useSessionFrames } from '@/shared/hooks/useSessionFrames';
import { sendAnswer, sendExtension } from '../services/permission.service';
import { usePermissionQueueStore } from '../store/permission.store';
import type {
  PermissionDecision,
  PermissionOutcome,
  PermissionRequest,
  PermissionScope,
} from '../types/permission';

/** What the screen gets: the questions, how the last ones ended, and the two things it can do. */
export interface PermissionQueue {
  readonly pending: readonly PermissionRequest[];
  readonly settled: readonly PermissionOutcome[];

  /** Milliseconds left on each card, recomputed on a tick the hook owns. */
  readonly remainingMs: Readonly<Record<string, number>>;

  answer(request: PermissionRequest, decision: PermissionDecision, scope: PermissionScope): void;
  extend(request: PermissionRequest): void;
}

/** How often the countdown is recomputed. A second is what a person perceives as a countdown. */
const TICK_MS = 1_000;

/** What Claude is told when a person refuses from this screen. */
const REFUSED_HERE = 'refused from the web client';

/**
 * The permission queue of the session on screen.
 *
 * The **countdown lives here and not in the store**: it is a function of the clock, not of the
 * stream, and a store that re-rendered every subscriber once a second would be a store that makes
 * the conversation flicker.
 *
 * A card whose countdown reaches zero leaves as refused, with nobody asked to confirm: the
 * deadline has already refused it on the server, and asking about something that is over is asking
 * about nothing.
 */
export function usePermissionQueue(sessionId: string | null): PermissionQueue {
  const pending = usePermissionQueueStore((state) => state.pending);
  const settled = usePermissionQueueStore((state) => state.settled);
  const apply = usePermissionQueueStore((state) => state.apply);
  const reset = usePermissionQueueStore((state) => state.reset);
  const markAnswering = usePermissionQueueStore((state) => state.markAnswering);
  const releaseAnswering = usePermissionQueueStore((state) => state.releaseAnswering);
  const expire = usePermissionQueueStore((state) => state.expire);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    reset();
  }, [sessionId, reset]);

  // A subscription of its own, beside the conversation's. Both watch the same session and neither
  // knows the other exists; the transport attaches once and re-delivers to both.
  useSessionFrames(sessionId, {
    apply,
    reset,
    // Always from the beginning of what the buffer has: a question is a `request` frame and
    // carries no `seq`, so this queue has no position of its own to resume from.
    lastSeq: () => 0,
  });

  useEffect(() => {
    if (pending.length === 0) {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);

    return () => {
      clearInterval(timer);
    };
  }, [pending.length]);

  useEffect(() => {
    for (const request of pending) {
      if (new Date(request.expiresAt).getTime() <= now) {
        expire(request.requestId);
      }
    }
  }, [pending, now, expire]);

  const answer = useCallback(
    (request: PermissionRequest, decision: PermissionDecision, scope: PermissionScope) => {
      if (request.isAnswering) {
        return;
      }

      markAnswering(request.requestId);

      const left = sendAnswer(wsClient, {
        requestId: request.requestId,
        frameId: request.frameId,
        decision,
        scope,
        // The contract requires a reason on a refusal: it goes into the trail and back to Claude
        // as a message, which is how the agent learns to propose something else.
        reason: decision === 'deny' ? REFUSED_HERE : null,
      });

      if (!left) {
        // The socket was down, so nothing was answered. Leaving the card disabled would leave a
        // question nobody can answer from a screen that looks like it is working on it.
        releaseAnswering(request.requestId);
      }
    },
    [markAnswering, releaseAnswering],
  );

  const extend = useCallback((request: PermissionRequest) => {
    sendExtension(wsClient, request.requestId);
  }, []);

  const remainingMs = Object.fromEntries(
    pending.map((request) => [
      request.requestId,
      Math.max(0, new Date(request.expiresAt).getTime() - now),
    ]),
  );

  return { pending, settled, remainingMs, answer, extend };
}
