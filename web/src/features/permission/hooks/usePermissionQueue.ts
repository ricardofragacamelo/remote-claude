import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';

import { wsClient } from '@/shared/api/ws';
import { sendAnswer, sendExtension } from '../services/permission.service';
import { createPermissionQueueStore, permissionQueueOf } from '../store/permission.store';
import { usePermissionAttachment } from './usePermissionAttachment';
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
  const store = sessionId === null ? DETACHED : permissionQueueOf(sessionId);
  const pending = useStore(store, (state) => state.pending);
  const settled = useStore(store, (state) => state.settled);
  const markAnswering = useStore(store, (state) => state.markAnswering);
  const releaseAnswering = useStore(store, (state) => state.releaseAnswering);
  const expire = useStore(store, (state) => state.expire);

  const [now, setNow] = useState(() => Date.now());

  // A subscription of its own, beside the conversation's. Both watch the same session and neither
  // knows the other exists; the transport attaches once and re-delivers to both. Shared with the
  // folder tab that keeps the session attached while it is not on screen (plan 06, S-181).
  usePermissionAttachment(sessionId);

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

/** What a screen with no session reads: an empty queue, attached to nothing. */
const DETACHED = createPermissionQueueStore();
