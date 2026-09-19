import { create } from 'zustand';
import type { Envelope } from '@remote-claude/contracts';

import { toExtension, toOutcome, toRequest } from '../services/permission.service';
import type { PermissionOutcome, PermissionRequest } from '../types/permission';

/** The questions of one session, and how the last few were settled. */
export interface PermissionQueueState {
  readonly pending: readonly PermissionRequest[];

  /** How the requests that have left the queue ended, newest last. */
  readonly settled: readonly PermissionOutcome[];

  /** Applies one frame of the session's stream. */
  apply(frame: Envelope): void;

  /** Marks a card as answering, so it takes no second click. */
  markAnswering(requestId: string): void;

  /** Gives the card back after an answer that never left — the socket was down. */
  releaseAnswering(requestId: string): void;

  /**
   * Drops a card whose deadline ran out on screen.
   *
   * The card leaves **as refused**, and without asking anybody to confirm it: the deadline has
   * already refused it on the server, and a dialogue about something that is over is a dialogue
   * about nothing (docs/architecture/web/04-state-and-data.md#a-fila-de-permissão).
   */
  expire(requestId: string): void;

  /** Drops everything, which is what a replay gap and a change of session call for. */
  reset(): void;
}

/**
 * The permission queue: the most delicate state in the front.
 *
 * Four rules hold it together, and each closes a way of being wrong that a person would notice:
 *
 * - **the queue reacts to events, never to its own optimism.** A request resolved on somebody's
 *   phone leaves this queue because `permission.resolved` said so, not because this client did
 *   anything;
 * - **losing the race is not an error.** The card leaves showing who won — the answer that
 *   reached the agent is the one the server published, not necessarily the one sent from here;
 * - **a card that is answering takes no second click**;
 * - **an expired card leaves as refused, silently.** Silence never authorises, on either end.
 */
export const usePermissionQueueStore = create<PermissionQueueState>((set) => ({
  pending: [],
  settled: [],

  apply: (frame) =>
    set((state) => {
      const requested = toRequest(frame);
      if (requested !== null) {
        // Replacing rather than appending: a reconnect republishes what is still open, and the
        // same question twice on screen is the same question twice.
        return {
          ...state,
          pending: [...without(state.pending, requested.requestId), requested],
        };
      }

      const outcome = toOutcome(frame);
      if (outcome !== null) {
        return {
          ...state,
          pending: without(state.pending, outcome.requestId),
          settled: [...state.settled, outcome],
        };
      }

      const extension = toExtension(frame);
      if (extension !== null) {
        return {
          ...state,
          pending: state.pending.map((request) =>
            request.requestId === extension.requestId
              ? { ...request, expiresAt: extension.expiresAt }
              : request,
          ),
        };
      }

      return state;
    }),

  markAnswering: (requestId) =>
    set((state) => ({ ...state, pending: answering(state.pending, requestId, true) })),

  releaseAnswering: (requestId) =>
    set((state) => ({ ...state, pending: answering(state.pending, requestId, false) })),

  expire: (requestId) =>
    set((state) =>
      state.pending.some((request) => request.requestId === requestId)
        ? {
            ...state,
            pending: without(state.pending, requestId),
            settled: [
              ...state.settled,
              { requestId, decision: 'deny' as const, auto: true, resolvedBy: null },
            ],
          }
        : state,
    ),

  reset: () => {
    set({ pending: [], settled: [] });
  },
}));

function without(
  pending: readonly PermissionRequest[],
  requestId: string,
): readonly PermissionRequest[] {
  return pending.filter((request) => request.requestId !== requestId);
}

function answering(
  pending: readonly PermissionRequest[],
  requestId: string,
  isAnswering: boolean,
): readonly PermissionRequest[] {
  return pending.map((request) =>
    request.requestId === requestId ? { ...request, isAnswering } : request,
  );
}
