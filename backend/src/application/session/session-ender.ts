import type { SessionCloseReason } from '@domain/session';
import type { SessionBroadcaster } from './ports/session-broadcaster.port';
import type { LiveSession, SessionRegistry } from './session-registry';

/**
 * The one way a live session is ended by us: announced, released, forgotten.
 *
 * Three callers end sessions on purpose — the owner closing one, the reaper putting an idle one
 * away and the shutdown closing them all — and each of them has to do the same three things in the
 * same order, or one of them eventually leaves a subprocess behind. Written once.
 *
 * The two halves are separate because the shutdown needs them apart: every session is announced,
 * then every socket closes, then every subprocess goes (docs/architecture/backend/06-realtime.md#shutdown).
 * Everybody else calls {@link end}, which is both halves back to back.
 */
export class SessionEnder {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly broadcaster: SessionBroadcaster,
  ) {}

  /**
   * Marks the session over and tells everybody watching it why.
   *
   * @returns `false` when it was already over — somebody else ended it first, and announcing it
   *   again would put two terminal events in the replay buffer
   */
  announce(live: LiveSession, reason: SessionCloseReason): boolean {
    if (live.session.isClosed) {
      return false;
    }

    // Closed **before** the subprocess goes: when the stream then ends, the callback of the start
    // use case finds it already closed and does not announce it a second time.
    live.session.close(reason);
    this.broadcaster.publish(live.session.id, {
      type: 'session.closed',
      payload: { sessionId: live.session.id.value, reason },
    });

    return true;
  }

  /**
   * Closes the subprocess and forgets the entry — the entry goes whatever `close()` does.
   *
   * A leaked subprocess does not die on its own, so a `close()` that throws still leaves the
   * registry without the session, and the slot free (S-03).
   */
  async release(live: LiveSession): Promise<void> {
    try {
      await live.handle.close();
    } finally {
      this.registry.remove(live.session.id);
    }
  }

  /** Both halves, for one session. Ending one that is already over only releases what is left. */
  async end(live: LiveSession, reason: SessionCloseReason): Promise<void> {
    this.announce(live, reason);
    await this.release(live);
  }
}
