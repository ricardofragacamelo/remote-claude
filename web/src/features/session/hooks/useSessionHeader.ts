import { useCallback, useRef } from 'react';
import { useStore } from 'zustand';

import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { useConnectionStatus } from '@/shared/hooks/useConnectionStatus';
import { sessionCostOf } from '../services/conversation-reducer';
import { closeSession } from '../services/live-session.service';
import { liveSessionStoreOf } from '../store/live-session.store';
import { useOwnedSessionsStore } from '../store/owned-sessions.store';
import type { SessionStatus } from '../types/live-session';

/** What the header of the panel says of the session on screen, and the one thing it does to it. */
export interface SessionHeaderState {
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly connection: ConnectionStatus;

  /** What the session has cost since it opened, as the contract writes money, and over how many turns. */
  readonly costUsd: string;
  readonly turns: number;

  /** Whether this browser opened it — only its owner may end it. */
  readonly isOwner: boolean;
  readonly ended: boolean;

  /** The conversation of Claude it is, once known — what exporting reads. */
  readonly conversationId: string | null;

  /** Ends the session — once, however often it is asked (plan 09, S-39). */
  close(): void;
}

/**
 * The session of the tab on screen, read for the header of the panel (plan 09, B-17, B-18): its
 * status, what it cost, whether it is this browser's, and the way to end it. It only **reads** the
 * store the conversation fills — the screen of the session is what attaches and loads the history,
 * so nothing here is asked of the backend twice.
 */
export function useSessionHeader(sessionId: string): SessionHeaderState {
  const store = liveSessionStoreOf(sessionId);
  const status = useStore(store, (state) => state.status);
  const turns = useStore(store, (state) => state.turns);
  const ended = useStore(store, (state) => state.ending !== null);
  const conversationId = useStore(store, (state) => state.conversationId);
  const isOwner = useOwnedSessionsStore((state) => state.owned.includes(sessionId));
  const connection = useConnectionStatus();
  const closed = useRef(false);

  return {
    sessionId,
    status,
    connection,
    costUsd: sessionCostOf(turns),
    turns: turns.length,
    isOwner,
    ended,
    conversationId,
    close: useCallback(() => {
      if (!closed.current) {
        closed.current = closeSession(wsClient, sessionId);
      }
    }, [sessionId]),
  };
}
