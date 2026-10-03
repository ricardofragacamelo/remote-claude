import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { cancelQueuedPrompt } from '../services/queue.service';
import { liveSessionStoreOf } from '../store/live-session.store';
import type { QueuedPrompt } from '../types/live-session';
import { useCommandRefusal } from './useCommandRefusal';

/** The queue of a session, as the panel shows it above the prompt box (plan 08, B-34). */
export interface Queue {
  readonly prompts: readonly QueuedPrompt[];

  /** Why the last cancel was refused — the prompt had just started, say. */
  readonly refusal: AppError | null;
  cancel(queueId: string): void;
}

/**
 * The prompts waiting for the turn to end — the backend's, the same for every client watching — and
 * the way to take one out before it reaches Claude (D-14). Taking the same one out twice asks once
 * (plan 09, S-31); a refusal lets it be asked again.
 */
export function useQueue(sessionId: string): Queue {
  const prompts = useStore(liveSessionStoreOf(sessionId), (state) => state.queue);
  const { error, expect } = useCommandRefusal();
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (error !== null) {
      asked.current.clear();
    }
  }, [error]);

  return {
    prompts,
    refusal: error,
    cancel: useCallback(
      (queueId: string) => {
        if (asked.current.has(queueId)) {
          return;
        }

        const commandId = cancelQueuedPrompt(wsClient, sessionId, queueId);
        if (commandId !== null) {
          asked.current.add(queueId);
        }
        expect(commandId);
      },
      [expect, sessionId],
    ),
  };
}
