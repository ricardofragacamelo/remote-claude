import { useRetainedSession } from '@/shared/hooks/useRetainedSession';
import type { SessionSubscriber } from '@/shared/api/ws-client';
import { permissionQueueOf } from '../store/permission.store';

/** Everything a subscription does, written against the queue of the session and nothing else. */
function intoQueue(sessionId: string): SessionSubscriber {
  const queue = permissionQueueOf(sessionId);

  return {
    onEvent: (frame) => {
      queue.getState().apply(frame);
    },
    onGap: () => {
      queue.getState().reset();
    },
    // Always from the beginning of what the buffer has: a question is a `request` frame and
    // carries no `seq`, so this queue has no position of its own to resume from.
    lastSeq: () => 0,
  };
}

/**
 * Holds the questions of a session arriving into its queue while the caller is up — the screen of
 * the session, and the folder tab it lives in when that tab is not on screen
 * ([06 · D-11](../../../../../docs/plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas)).
 */
export function usePermissionAttachment(sessionId: string | null): void {
  useRetainedSession('permission', sessionId, intoQueue);
}
