import { create } from 'zustand';
import type { Envelope } from '@remote-claude/contracts';

import { readEvent } from '../services/live-session.service';
import type { Conversation, SessionStatus } from '../types/live-session';

/** The conversation of one session, as the client has it. */
export interface LiveSessionState extends Conversation {
  readonly sessionId: string | null;

  /** The highest sequence applied. Everything at or below it is a replay of what is already here. */
  readonly lastSeq: number;

  /**
   * Whether what is on screen is only what the ring buffer still held.
   *
   * It is set when a session is opened after it ended, and it is what the UI labels. Without the
   * label, an absence of content reads as an absence of activity — which is worse than showing
   * nothing at all ([D-10](../../../../../docs/plans/01-live-session/decisions.md)).
   */
  readonly isPartial: boolean;

  /** Points the store at a session, clearing whatever the last one left. */
  open(sessionId: string, options?: { readonly partial?: boolean }): void;

  /** Applies one frame from the stream. */
  apply(frame: Envelope): void;

  /** Drops everything, which is what a replay gap calls for. */
  reset(): void;
}

/** A session nothing has been said in yet. */
const EMPTY = {
  sessionId: null,
  status: 'starting' as SessionStatus,
  lastSeq: 0,
  messages: [],
  tools: [],
  lastTurn: null,
  ending: null,
  isPartial: false,
} satisfies Omit<LiveSessionState, 'open' | 'apply' | 'reset'>;

/**
 * The live stream of one session.
 *
 * Three rules of the contract live here, and none of them is optional
 * (docs/architecture/web/04-state-and-data.md):
 *
 * 1. **An event with `seq <= lastSeq` is discarded.** A replay re-delivers what the client already
 *    has, and without this every reconnect duplicates the tail of the conversation.
 * 2. **A gap clears the store.** When the server says the buffer no longer holds what was missed,
 *    the client reloads from scratch. Stitching a partial hole produces a view that looks complete
 *    and is not, which is worse than one that admits it has to reload.
 * 3. **`message.delta` accumulates by `messageId`**, and `message.completed` replaces what it
 *    accumulated. Concatenating deltas in arrival order turns two answers in flight into one
 *    paragraph of nonsense — and two answers in flight is ordinary, not exotic.
 */
export const useLiveSessionStore = create<LiveSessionState>((set) => ({
  ...EMPTY,

  open: (sessionId, options) => {
    set({ ...EMPTY, sessionId, isPartial: options?.partial ?? false });
  },

  apply: (frame) =>
    set((state) => {
      const seq = frame.seq;

      // A `request` frame carries no `seq` — a question is not part of the history — and belongs
      // to the permission queue, not to the conversation.
      if (seq === undefined || seq <= state.lastSeq) {
        return state;
      }

      return { ...readEvent(state, frame), lastSeq: seq };
    }),

  reset: () => {
    set({ ...EMPTY });
  },
}));
