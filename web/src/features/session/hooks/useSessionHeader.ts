import { useCallback, useRef } from 'react';
import { useStore } from 'zustand';

import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { useConnectionStatus } from '@/shared/hooks/useConnectionStatus';
import type { ConversationRef } from '@/shared/lib/conversation';
import { sessionCostOf } from '../services/conversation-reducer';
import { closeSession } from '../services/live-session.service';
import { liveSessionStoreOf } from '../store/live-session.store';
import type { SessionStatus } from '../types/live-session';

/** What the header of the panel says of the session on screen, and the one thing it does to it. */
export interface SessionHeaderState {
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly connection: ConnectionStatus;

  /** What the session has cost since it opened, as the contract writes money, and over how many turns. */
  readonly costUsd: string;
  readonly turns: number;
  readonly ended: boolean;

  /** The conversation it is, once known — what exporting reads, and what "copy id" copies. */
  readonly conversation: ConversationRef | null;

  /** Ends the session — once, however often it is asked (plan 09, S-39). */
  close(): void;
}

/**
 * The session of the tab on screen, read for the header of the panel (plan 09, B-17, B-18): its
 * status, what it cost, and the way to end it — any of this account's own devices may, the backend's
 * ownership is by user, never by device or connection (05 · "Autorização por connection"). It only
 * **reads** the store the conversation fills — the screen of the session is what attaches and loads
 * the history, so nothing here is asked of the backend twice.
 */
export function useSessionHeader(sessionId: string): SessionHeaderState {
  const store = liveSessionStoreOf(sessionId);
  const status = useStore(store, (state) => state.status);
  const turns = useStore(store, (state) => state.turns);
  const ended = useStore(store, (state) => state.ending !== null);
  const conversation = useStore(store, (state) => state.conversation);
  const connection = useConnectionStatus();
  const closed = useRef(false);

  return {
    sessionId,
    status,
    connection,
    costUsd: sessionCostOf(turns),
    turns: turns.length,
    ended,
    conversation,
    close: useCallback(() => {
      if (!closed.current) {
        closed.current = closeSession(wsClient, sessionId);
      }
    }, [sessionId]),
  };
}
