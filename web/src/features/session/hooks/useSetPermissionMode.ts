import { useCallback } from 'react';

import { wsClient } from '@/shared/api/ws';
import { setSessionPermissionMode } from '../services/live-session.service';
import { liveSessionStoreOf } from '../store/live-session.store';

/**
 * Changes the permission mode of a session — what approving a plan does, to go on asking for each
 * edit or accepting them (plan 08, B-22). Nothing when there is no session.
 *
 * The mode sent is the mode the session shows, as the picker of its header does: the backend
 * announces none, and a plan approved left the header saying "Plan" while Claude went on in another
 * mode (found by the e2e, S-263).
 */
export function useSetPermissionMode(sessionId: string | null): (mode: string) => void {
  return useCallback(
    (mode: string) => {
      if (sessionId !== null && setSessionPermissionMode(wsClient, sessionId, mode) !== null) {
        liveSessionStoreOf(sessionId).getState().noteMode(mode);
      }
    },
    [sessionId],
  );
}
