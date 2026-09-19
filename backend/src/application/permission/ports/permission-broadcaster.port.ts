import type { SessionId } from '@domain/session';

/** A frame on its way to every connection watching a session. */
export interface PermissionFrame {
  /** A `type` of the generated contract, such as `permission.requested`. */
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * How the permission module reaches the connections watching a session.
 *
 * A port and not the hub, for the same reason `session` has one: the hub is transport, it lives in
 * `infrastructure/`, and a use case that imported it would have the dependency pointing outward.
 *
 * The two methods differ in one thing that matters. A **request** is a question that is still open,
 * so it is not kept for replay — a reconnecting client is told about pending requests by the
 * registry, which knows which ones are still pending, rather than by a buffer that would replay
 * questions that have since been answered
 * ([ADR-012](../../../../docs/architecture/shared/00-decisions.md)). An **event** is history and
 * is buffered like any other.
 */
export interface PermissionBroadcaster {
  /** Puts an open question to everybody watching. Not numbered, and not replayed. */
  request(sessionId: SessionId, frame: PermissionFrame): void;

  /** Publishes a fact about a request, numbered and replayable like any other event. */
  publish(sessionId: SessionId, frame: PermissionFrame): void;
}

export const PERMISSION_BROADCASTER = Symbol('PermissionBroadcaster');
