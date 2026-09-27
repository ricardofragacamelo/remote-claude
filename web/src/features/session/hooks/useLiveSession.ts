import { useCallback, useEffect, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { useSessionFrames } from '@/shared/hooks/useSessionFrames';
import { fetchHistoryPage } from '../services/history.service';
import {
  closeSession,
  interruptSession,
  sendPrompt,
  setSessionModel,
  setSessionPermissionMode,
  startSession,
} from '../services/live-session.service';
import { useLiveSessionStore } from '../store/live-session.store';
import type { Conversation } from '../types/live-session';
import { useCommandRefusal } from './useCommandRefusal';

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

  start(workspacePath: string): void;
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
  const state = useLiveSessionStore();
  const [connection, setConnection] = useState<ConnectionStatus>('idle');

  // A session this browser opened is one it may close. Anything else it may only watch, and the
  // control says so rather than disappearing — hiding an authorisation rule makes it look like a
  // bug the first time somebody hits it.
  const [owned, setOwned] = useState<readonly string[]>([]);

  useEffect(() => wsClient.onStatus(setConnection), []);

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
          setOwned((previous) => [...previous, started]);
        }
      }),
    [],
  );

  useEffect(() => {
    if (sessionId === null) {
      return;
    }

    // Opened as partial whenever the screen arrived at a session it did not start: the replay is
    // whatever survived, and that is exactly what the label is for.
    useLiveSessionStore.getState().open(sessionId, { partial: !owned.includes(sessionId) });
  }, [sessionId, owned]);

  useSessionFrames(sessionId, {
    apply: (frame) => {
      useLiveSessionStore.getState().apply(frame);
    },
    reset: (claudeSessionId) => {
      useLiveSessionStore.getState().reset(claudeSessionId);
    },
    lastSeq: () => useLiveSessionStore.getState().lastSeq,
  });

  const history = useHistoryUnderStream(state.historyFrom, state.conversationId);
  const { error: promptError, expect: expectRefusal } = useCommandRefusal();

  const start = useCallback((workspacePath: string) => {
    startSession(wsClient, workspacePath);
  }, []);

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
    lastTurn: state.lastTurn,
    ending: state.ending,
    isPartial: state.isPartial,
    isOwner: sessionId !== null && owned.includes(sessionId),
    history,
    promptError,
    start,
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
function useHistoryUnderStream(from: string | null, conversationId: string | null): HistoryStatus {
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
          useLiveSessionStore.getState().hydrate(from, page.events);
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
  }, [from, attempt]);

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
