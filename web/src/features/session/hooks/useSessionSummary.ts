import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { formatUsd } from '../lib/money';
import { sessionCostOf } from '../services/conversation-reducer';
import { liveSessionStoreOf } from '../store/live-session.store';
import type { SessionStatus } from '../types/live-session';

/** Where a session stands, at a glance: what the status bar says of it (plan 08, B-41). */
export interface SessionSummary {
  readonly status: SessionStatus;
  readonly model: string | null;

  /** What it cost since it opened — each turn once — as money is read where the person is. */
  readonly cost: string;
}

export function useSessionSummary(sessionId: string): SessionSummary {
  const { i18n } = useTranslation();
  const live = liveSessionStoreOf(sessionId);

  return {
    status: useStore(live, (state) => state.status),
    model: useStore(live, (state) => state.model),
    cost: formatUsd(sessionCostOf(useStore(live, (state) => state.turns)), i18n.language),
  };
}
