import { create } from 'zustand';
import type { Envelope } from '@remote-claude/contracts';

import { toPong } from '../services/ping.service';
import type { PingRequest } from '../types/ping';

export interface PingState {
  readonly sessionId: string | null;
  readonly lastSeq: number;

  /** What this screen sent, oldest first, each with its answer once it came. */
  readonly requests: readonly PingRequest[];

  /** A ping left, with this nonce, at this moment. */
  sent(nonce: string, at: number): void;

  /** Applies one event from the stream, at the moment it arrived. */
  apply(frame: Envelope, at?: number): void;

  /** Drops everything, which is what a replay gap calls for. */
  reset(): void;
}

/**
 * The round trips of this browser — the ping of Logs and diagnostics.
 *
 * Two rules of the contract live here, and neither is optional:
 *
 * 1. **An event with `seq <= lastSeq` is discarded.** A replay re-delivers what the client already
 *    has, and without this every reconnect answers a request twice.
 * 2. **A gap clears the store.** When the server says the buffer no longer holds what was missed,
 *    the client starts over. Stitching a partial hole produces a view that looks complete and is not.
 *
 * And one of its own: an answer is matched to its request by the **nonce**, never by arriving next.
 * A pong no request of this screen sent — another window's, one the replay brought — moves the
 * sequence on and answers nobody (plan 06, S-141, S-205).
 */
export const usePingStore = create<PingState>((set) => ({
  sessionId: null,
  lastSeq: 0,
  requests: [],

  sent: (nonce, at) =>
    set((state) => ({
      requests: [...state.requests, { nonce, sentAt: at, pong: null, answeredAt: null }],
    })),

  apply: (frame, at = Date.now()) =>
    set((state) => {
      const pong = toPong(frame);

      if (pong === null || pong.seq <= state.lastSeq) {
        return state;
      }

      return {
        sessionId: pong.sessionId,
        lastSeq: pong.seq,
        requests: state.requests.map((request) =>
          request.nonce === pong.nonce && request.pong === null
            ? { ...request, pong, answeredAt: at }
            : request,
        ),
      };
    }),

  reset: () => set({ sessionId: null, lastSeq: 0, requests: [] }),
}));
