import { useCallback, useEffect, useState } from 'react';

import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { useSessionFrames } from '@/shared/hooks/useSessionFrames';
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

/** What the screen gets: the conversation, where it stands, and what it can do about it. */
export interface LiveSession extends Conversation {
  readonly connection: ConnectionStatus;
  readonly sessionId: string | null;

  /** What is on screen is only what the ring buffer still held. The UI says so. */
  readonly isPartial: boolean;

  /** Whether this browser opened the session, which is what decides who may close it. */
  readonly isOwner: boolean;

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
  useEffect(
    () =>
      wsClient.observe((frame) => {
        const started = frame.payload?.['sessionId'];

        if (frame.type === 'session.started' && typeof started === 'string') {
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
    reset: () => {
      useLiveSessionStore.getState().reset();
    },
    lastSeq: () => useLiveSessionStore.getState().lastSeq,
  });

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
    start,
    prompt: useCallback(
      (text: string) => {
        drive((id) => sendPrompt(wsClient, id, text));
      },
      [drive],
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
