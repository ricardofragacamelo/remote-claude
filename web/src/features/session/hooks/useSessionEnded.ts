import { useStore } from 'zustand';

import { liveSessionStoreOf } from '../store/live-session.store';

/** Whether a session has ended, as its stream said — nothing is asked of one that has. */
export function useSessionEnded(sessionId: string): boolean {
  return useStore(liveSessionStoreOf(sessionId), (state) => state.status === 'closed');
}
