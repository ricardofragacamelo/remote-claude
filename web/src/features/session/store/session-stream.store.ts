import { create } from 'zustand';
import type { Envelope } from '@remote-claude/contracts';

import { toPong } from '../services/session.service';
import type { Pong } from '../types/pong';

export interface SessionStreamState {
  readonly sessionId: string | null;
  readonly lastSeq: number;
  readonly pongs: readonly Pong[];

  /** Applies one event from the stream. */
  apply(frame: Envelope): void;

  /** Drops everything, which is what a replay gap calls for. */
  reset(): void;
}

/**
 * The live stream of one session.
 *
 * Two rules of the contract live here, and neither is optional:
 *
 * 1. **An event with `seq <= lastSeq` is discarded.** A replay re-delivers what the client already
 *    has, and without this every reconnect duplicates the tail of the transcript.
 * 2. **A gap clears the store.** When the server says the buffer no longer holds what was missed,
 *    the client reloads from scratch. Stitching a partial hole produces a view that looks complete
 *    and is not, which is worse than one that admits it has to reload.
 *
 * The third rule of docs/architecture/web/04-state-and-data.md — accumulating `message.delta` by
 * `messageId` — belongs to the messaging events, which the bootstrap contract does not carry yet.
 */
export const useSessionStreamStore = create<SessionStreamState>((set) => ({
  sessionId: null,
  lastSeq: 0,
  pongs: [],

  apply: (frame) =>
    set((state) => {
      const pong = toPong(frame);

      if (pong === null || pong.seq <= state.lastSeq) {
        return state;
      }

      return {
        ...state,
        sessionId: pong.sessionId,
        lastSeq: pong.seq,
        pongs: [...state.pongs, pong],
      };
    }),

  reset: () => set({ sessionId: null, lastSeq: 0, pongs: [] }),
}));
