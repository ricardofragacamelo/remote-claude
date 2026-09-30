import { useEffect, useRef } from 'react';

import { sessionAttachments } from '@/shared/api/ws';
import type { SessionSubscriber } from '@/shared/api/ws-client';

/**
 * Holds one session attached for as long as the component is up — shared with every other holder
 * of the same `key` (plan 06, S-181).
 *
 * The subscriber is built by the first holder only, so it has to read what every holder reads — the
 * store of that session — and never the state of the component that happened to be first.
 *
 * @param key which stream of the session: the conversation, the permission queue
 * @param subscriber read through a ref: a caller that builds it inline does not re-attach on every render
 */
export function useRetainedSession(
  key: string,
  sessionId: string | null,
  subscriber: (sessionId: string) => SessionSubscriber,
): void {
  const build = useRef(subscriber);

  useEffect(() => {
    build.current = subscriber;
  }, [subscriber]);

  useEffect(() => {
    if (sessionId === null) {
      return;
    }

    return sessionAttachments.retain(key, sessionId, () => build.current(sessionId));
  }, [key, sessionId]);
}
