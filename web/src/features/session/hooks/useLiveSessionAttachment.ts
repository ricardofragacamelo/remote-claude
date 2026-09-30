import { useRetainedSession } from '@/shared/hooks/useRetainedSession';
import type { SessionSubscriber } from '@/shared/api/ws-client';
import { liveSessionStoreOf } from '../store/live-session.store';

/** Everything a subscription does, written against the store of the session and nothing else. */
function intoStore(sessionId: string): SessionSubscriber {
  const store = liveSessionStoreOf(sessionId);

  return {
    onEvent: (frame) => {
      store.getState().apply(frame);
    },
    onGap: (claudeSessionId) => {
      store.getState().reset(claudeSessionId);
    },
    lastSeq: () => store.getState().lastSeq,
  };
}

/**
 * Holds the conversation of a session attached, into its store, while the caller is up.
 *
 * The screen of the session holds it, and so does the folder tab it lives in — when the tab is not
 * on screen, the stream keeps arriving into the same store, and coming back to it attaches nothing
 * again ([06 · D-11](../../../../../docs/plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas)).
 */
export function useLiveSessionAttachment(sessionId: string | null): void {
  useRetainedSession('live-session', sessionId, intoStore);
}
