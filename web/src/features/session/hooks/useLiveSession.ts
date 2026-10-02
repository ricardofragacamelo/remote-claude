import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { useConnectionStatus } from '@/shared/hooks/useConnectionStatus';
import { fetchHistoryPage } from '../services/history.service';
import { sessionCostOf } from '../services/conversation-reducer';
import {
  closeSession,
  interruptSession,
  sendPrompt,
  setSessionModel,
  setSessionPermissionMode,
} from '../services/live-session.service';
import { createLiveSessionStore, liveSessionStoreOf } from '../store/live-session.store';
import type { LiveSessionStore } from '../store/live-session.store';
import { useOwnedSessionsStore } from '../store/owned-sessions.store';
import type { Conversation } from '../types/live-session';
import { useCommandRefusal } from './useCommandRefusal';
import { useLiveSessionAttachment } from './useLiveSessionAttachment';

/** Where the history under the stream is: arriving, failed, or not being waited for. */
export interface HistoryStatus {
  readonly isLoading: boolean;

  /** Why it could not be read. What the stream brought stays on screen beside it. */
  readonly error: AppError | null;

  /** The conversation of Claude this session is, once known — what the whole history is read by. */
  readonly conversationId: string | null;

  retry(): void;
}

/** What the screen gets: the conversation, where it stands, and what it can do about it. */
export interface LiveSession extends Conversation {
  /** What the session has cost since it opened — each turn once, the replay never twice (S-99). */
  readonly costUsd: string;

  readonly connection: ConnectionStatus;
  readonly sessionId: string | null;

  /** What is on screen is only what the ring buffer still held. The UI says so. */
  readonly isPartial: boolean;

  /** Whether this browser opened the session, which is what decides who may close it. */
  readonly isOwner: boolean;

  /** The part of the conversation the ring buffer does not hold. */
  readonly history: HistoryStatus;

  /**
   * Why the last prompt was refused — a slash command this installation does not have. Cleared
   * when the next one leaves.
   */
  readonly promptError: AppError | null;

  prompt(text: string): void;
  interrupt(): void;
  setModel(model: string): void;
  setPermissionMode(mode: string): void;
  close(): void;
}

/**
 * The session on screen.
 *
 * The hook is the only layer that knows both sides: React above, the client below. The component
 * never learns that a socket exists, and the client never learns that React does.
 *
 * Opening a session **that has already ended** is an ordinary case, not an edge one: the store is
 * marked partial, the replay brings back whatever the ring buffer still holds, and the screen says
 * so. The other branch — a buffer the backend has since restarted and lost — is what happens after
 * every restart, and it shows the terminal state alone
 * ([D-10](../../../../../docs/plans/01-live-session/decisions.md)).
 */
export function useLiveSession(sessionId: string | null): LiveSession {
  // A session this browser opened is one it may close. Anything else it may only watch, and the
  // control says so rather than disappearing — hiding an authorisation rule makes it look like a
  // bug the first time somebody hits it. Kept in a store, because the screen that opened it is
  // usually not this one.
  const owned = useOwnedSessionsStore((store) => store.owned);
  const connection = useConnectionStatus();

  // The store of **this** session. Arriving at one this browser did not start marks it partial:
  // the replay is whatever survived, and that is exactly what the label is for.
  const store = storeOf(sessionId, owned);
  const state = useStore(store);

  // `session.start` **opens** the session it is about, so `session.started` arrives before
  // anything could have attached to it.
  //
  // A resume of a conversation that was already live is answered with `session.attached` for a
  // session nobody here watches yet, and the backend only ever joins the caller to their **own**
  // live session — so that one is this browser's to close as well.
  useEffect(
    () =>
      wsClient.observe((frame) => {
        const started = frame.payload?.['sessionId'];
        const opened = frame.type === 'session.started' || frame.type === 'session.attached';

        if (opened && typeof started === 'string') {
          useOwnedSessionsStore.getState().claim(started);
        }
      }),
    [],
  );

  // Held while the screen is up — and shared with the folder tab that keeps it attached when the
  // screen is not, so coming back sends nothing on the wire (plan 06, S-181).
  useLiveSessionAttachment(sessionId);

  const history = useHistoryUnderStream(store, state.historyFrom, state.conversationId);
  const { error: promptError, expect: expectRefusal } = useCommandRefusal();

  const drive = useCallback(
    (run: (id: string) => void) => {
      if (sessionId !== null) {
        run(sessionId);
      }
    },
    [sessionId],
  );

  return {
    connection,
    sessionId,
    status: state.status,
    messages: state.messages,
    tools: state.tools,
    timeline: state.timeline,
    turns: state.turns,
    costUsd: sessionCostOf(state.turns),
    lastTurn: state.lastTurn,
    ending: state.ending,
    isPartial: state.isPartial,
    isOwner: sessionId !== null && owned.includes(sessionId),
    history,
    promptError,
    prompt: useCallback(
      (text: string) => {
        drive((id) => {
          expectRefusal(sendPrompt(wsClient, id, text));
        });
      },
      [drive, expectRefusal],
    ),
    interrupt: useCallback(() => {
      drive((id) => interruptSession(wsClient, id));
    }, [drive]),
    setModel: useCallback(
      (model: string) => {
        drive((id) => setSessionModel(wsClient, id, model));
      },
      [drive],
    ),
    setPermissionMode: useCallback(
      (mode: string) => {
        drive((id) => setSessionPermissionMode(wsClient, id, mode));
      },
      [drive],
    ),
    close: useCallback(() => {
      drive((id) => closeSession(wsClient, id));
    }, [drive]),
  };
}

/** A failed load, and which conversation it failed for. */
interface HistoryFailure {
  readonly from: string;
  readonly attempt: number;
  readonly error: AppError;
}

/**
 * Loads the latest page of a conversation whenever the store is waiting for one, and lays it under
 * the stream.
 *
 * Always from the network, never from a cache: it answers a gap, and a gap means what is on screen
 * can no longer be trusted — a copy kept from before it would be the same lie. The latest page is
 * what it reads; the whole conversation is one link away, on the history screen.
 *
 * The stream keeps arriving while the page is in flight, and that is fine by construction: the page
 * is **merged** by message id under whatever the stream brought meanwhile (S-15). An answer for a
 * conversation the store no longer waits on lands nowhere.
 */
function useHistoryUnderStream(
  store: LiveSessionStore,
  from: string | null,
  conversationId: string | null,
): HistoryStatus {
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<HistoryFailure | null>(null);

  useEffect(() => {
    if (from === null) {
      return;
    }

    let current = true;

    void fetchHistoryPage(from, null)
      .then((page) => {
        if (current) {
          store.getState().hydrate(from, page.events);
        }
      })
      .catch((error: AppError) => {
        if (current) {
          setFailure({ from, attempt, error });
        }
      });

    return () => {
      current = false;
    };
  }, [store, from, attempt]);

  const failed = failure !== null && failure.from === from && failure.attempt === attempt;

  return {
    isLoading: from !== null && !failed,
    error: failed ? failure.error : null,
    conversationId,
    retry: useCallback(() => {
      setAttempt((previous) => previous + 1);
    }, []),
  };
}

/** What a screen with no session reads: nothing, attached to nothing. */
const DETACHED = createLiveSessionStore(null);

/** The store of the session on screen — marked partial when this browser did not start it. */
function storeOf(sessionId: string | null, owned: readonly string[]): LiveSessionStore {
  return sessionId === null
    ? DETACHED
    : liveSessionStoreOf(sessionId, { partial: !owned.includes(sessionId) });
}
