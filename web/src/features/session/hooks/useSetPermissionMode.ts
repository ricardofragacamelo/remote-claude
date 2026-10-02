import { useCallback } from 'react';

import { wsClient } from '@/shared/api/ws';
import { setSessionPermissionMode } from '../services/live-session.service';

/**
 * Changes the permission mode of a session — what approving a plan does, to go on asking for each
 * edit or accepting them (plan 08, B-22). Nothing when there is no session.
 */
export function useSetPermissionMode(sessionId: string | null): (mode: string) => void {
  return useCallback(
    (mode: string) => {
      if (sessionId !== null) {
        setSessionPermissionMode(wsClient, sessionId, mode);
      }
    },
    [sessionId],
  );
}
