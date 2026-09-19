import { useEffect, useRef } from 'react';
import type { Envelope } from '@remote-claude/contracts';

import { wsClient } from '@/shared/api/ws';

/** What a feature does with the stream of one session. */
export interface SessionFrameHandlers {
  /** One frame of the session: an `event`, or the `request` that a permission is. */
  apply(frame: Envelope): void;

  /** The buffer no longer holds what was missed: drop local state and start again. */
  reset(): void;

  /** The highest `seq` this feature has applied, so a reconnect can resume from it. */
  lastSeq(): number;
}

/**
 * Watches one session's stream, and stops when the screen does.
 *
 * Generic on purpose, and shared for the reason `shared/` exists: three different features watch a
 * session — the conversation, the permission queue and the diagnostic round trip — and all three
 * need the same six lines. **The detach is the part worth writing once**: without it, moving
 * between sessions piles up subscriptions and a screen starts receiving frames for a session it is
 * no longer showing.
 *
 * The handlers are read through a ref rather than depended on, so a caller that builds them inline
 * does not resubscribe on every render — and a resubscription is a `session.attach` on the wire.
 */
export function useSessionFrames(sessionId: string | null, handlers: SessionFrameHandlers): void {
  // The handlers are a bag of callbacks reading live state, rebuilt on every render. Kept in a ref
  // rather than depended on, because depending on them would detach and re-attach on every render
  // — and a re-attach is a `session.attach` on the wire, asking for a replay nobody needs.
  //
  // Written from an effect and never during render: a ref read while rendering is how a component
  // stops updating when it should.
  const latest = useRef(handlers);

  useEffect(() => {
    latest.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (sessionId === null) {
      return;
    }

    return wsClient.attach(sessionId, {
      onEvent: (frame) => {
        latest.current.apply(frame);
      },
      onGap: () => {
        latest.current.reset();
      },
      lastSeq: () => latest.current.lastSeq(),
    });
  }, [sessionId]);
}
