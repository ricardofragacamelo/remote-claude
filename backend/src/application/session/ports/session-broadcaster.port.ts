import type { SessionId } from '@domain/session';
import type { SessionEvent } from './claude-session.port';

/**
 * How an event reaches the connections watching a session.
 *
 * A port rather than the hub itself, because the hub is transport: it lives in
 * `infrastructure/websocket/`, and a use case that imported it would have the dependency pointing
 * the wrong way. What the application knows is that events go somewhere; `seq`, the ring buffer
 * and the sockets are on the other side of this interface.
 */
export interface SessionBroadcaster {
  publish(sessionId: SessionId, event: SessionEvent): void;

  /**
   * Tells everybody watching that something failed, now.
   *
   * Separate from {@link publish} because it is not part of the conversation: it carries no
   * sequence and it is not replayed. A failure replayed ten minutes later reports a problem that
   * has already been dealt with.
   */
  publishError(sessionId: SessionId, error: unknown): void;
}

export const SESSION_BROADCASTER = Symbol('SessionBroadcaster');
