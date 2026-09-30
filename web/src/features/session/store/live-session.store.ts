import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { Envelope } from '@remote-claude/contracts';

import { rewoundOf } from '../services/checkpoint.service';
import { conversationOfStart, readEvent, withHistory } from '../services/live-session.service';
import type { RewindOutcome } from '../types/checkpoint';
import type { HistoryEvent } from '../types/history';
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

  /**
   * The conversation of Claude this session is — its id in Claude's store, not ours — once the
   * stream or the attach has said so.
   */
  readonly conversationId: string | null;

  /**
   * The conversation whose history this screen is waiting to lay under the stream, or `null`.
   *
   * Set by the two moments the ring buffer cannot answer: a resumed session, whose earlier part
   * lives in the transcript and not in the buffer (B-11), and a gap, after which the buffer no
   * longer holds what was missed (B-07). The hook reads it and loads; {@link hydrate} clears it.
   */
  readonly historyFrom: string | null;

  /**
   * What the last undo of this session did to the disk, as `session.rewound` reported it.
   *
   * Kept whoever asked for it: the event goes to every connection watching, because the files
   * changed for all of them.
   */
  readonly lastRewind: RewindOutcome | null;

  /** Applies one frame from the stream. */
  apply(frame: Envelope): void;

  /**
   * Drops everything, which is what a replay gap calls for — and asks for the history again.
   *
   * @param claudeSessionId the conversation the ack said to reload from, or `null` when the stream
   *   is not one
   */
  reset(claudeSessionId?: string | null): void;

  /**
   * Lays a page of history under the stream, if it is the history still being waited for.
   *
   * A page for a conversation this screen no longer waits on — a second gap asked again, or the
   * screen moved to another session — lands nowhere.
   */
  hydrate(conversationId: string, events: readonly HistoryEvent[]): void;
}

/** The store of one session's conversation. */
export type LiveSessionStore = StoreApi<LiveSessionState>;

/** How a store starts: marked partial when the screen arrived at a session it did not start. */
export interface LiveSessionOptions {
  readonly partial?: boolean;
}

/** A session nothing has been said in yet. */
const EMPTY = {
  status: 'starting' as SessionStatus,
  lastSeq: 0,
  messages: [],
  tools: [],
  lastTurn: null,
  ending: null,
  isPartial: false,
  conversationId: null,
  historyFrom: null,
  lastRewind: null,
} satisfies Omit<LiveSessionState, 'sessionId' | 'apply' | 'reset' | 'hydrate'>;

/**
 * The live stream of one session — **one store per session**, never one for "the session on screen".
 *
 * Several sessions are attached at once: each folder tab keeps its own while it is not on screen
 * ([06 · D-11](../../../../../docs/plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas)),
 * and one store pointed at whichever was shown last would mix two conversations.
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
 *
 * And one of the history's, since plan 04: what the buffer cannot hold is **laid under** the
 * stream, never mixed into it. The history carries no `seq`, and the stream keeps arriving while it
 * loads — so it is merged by message and tool id, with the stream on top (S-14, S-15).
 */
export function createLiveSessionStore(
  sessionId: string | null,
  options: LiveSessionOptions = {},
): LiveSessionStore {
  return createStore<LiveSessionState>((set) => ({
    ...EMPTY,
    sessionId,
    isPartial: options.partial ?? false,

    apply: (frame) =>
      set((state) => {
        const seq = frame.seq;

        // A `request` frame carries no `seq` — a question is not part of the history — and belongs
        // to the permission queue, not to the conversation.
        if (seq === undefined || seq <= state.lastSeq) {
          return state;
        }

        const started = conversationOfStart(frame);
        const rewound = rewoundOf(frame);

        return {
          ...readEvent(state, frame),
          lastSeq: seq,
          ...(rewound === null ? {} : { lastRewind: rewound }),
          ...(started === null
            ? {}
            : {
                conversationId: started.claudeSessionId ?? state.conversationId,
                // A resume: what was said before this session began is in the transcript, not in
                // the buffer, and it is read from the conversation this one continues.
                historyFrom: started.resumedFrom ?? state.historyFrom,
              }),
        };
      }),

    reset: (claudeSessionId = null) => {
      // The session stays the one it is; what it said is what goes. Stitching a partial hole
      // produces a view that looks complete and is not.
      set((state) => ({
        ...EMPTY,
        conversationId: claudeSessionId ?? state.conversationId,
        historyFrom: claudeSessionId,
      }));
    },

    hydrate: (conversationId, events) => {
      set((state) =>
        state.historyFrom === conversationId
          ? { ...withHistory(state, events), historyFrom: null, isPartial: false }
          : state,
      );
    },
  }));
}

/** The store of each session this page has shown or kept attached. */
const stores = new Map<string, LiveSessionStore>();

/**
 * The store of one session — the same one for everybody who asks, created on the first ask.
 *
 * `options` only count at creation: whether a session is partial is decided by what the screen knew
 * when it first arrived at it, and a store that already holds the conversation keeps it.
 */
export function liveSessionStoreOf(
  sessionId: string,
  options?: LiveSessionOptions,
): LiveSessionStore {
  const existing = stores.get(sessionId);

  if (existing !== undefined) {
    return existing;
  }

  const created = createLiveSessionStore(sessionId, options);
  stores.set(sessionId, created);
  return created;
}

/** Drops every store — what a sign-out calls for, and what keeps one test from seeing another's. */
export function forgetLiveSessions(): void {
  stores.clear();
}
