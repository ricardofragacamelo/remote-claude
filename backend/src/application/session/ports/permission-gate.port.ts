import type { SessionId } from '@domain/session';

/** One question the SDK is holding its loop open for. */
export interface PermissionQuestion {
  readonly sessionId: SessionId;

  /**
   * The SDK's own key for the question.
   *
   * Idempotency is by **this** and never by `toolUseId`: after a transport gap the SDK redelivers
   * a pending call, and answering it twice would run the tool twice.
   */
  readonly requestId: string;

  readonly toolUseId: string | null;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;

  /** The SDK's cancellation. It fires when the session dies with a request still open. */
  readonly signal: AbortSignal;
}

/** The answer, in the only two values the loop understands. */
export interface PermissionVerdict {
  readonly decision: 'allow' | 'deny';

  /** Why it was refused. It goes back to Claude as a message, so it is never empty on a `deny`. */
  readonly reason: string | null;
}

/**
 * How the session runtime asks a human.
 *
 * It is the port behind `canUseTool`, and the reason the whole transport is a socket: the call
 * **blocks the agent loop** until it answers. What is on the other side — a request published to
 * every connection watching, a rule that answers without disturbing anybody, a deadline that
 * denies — belongs to the `permission` module, and `session` depends on the question rather than
 * on who answers it (docs/architecture/backend/03-modules.md#fronteiras).
 *
 * It never rejects. A gate that threw would leave the SDK to decide what an exception means, and
 * the one thing that must not be left to interpretation is what happens when nobody answers.
 */
export interface SessionPermissionGate {
  ask(question: PermissionQuestion): Promise<PermissionVerdict>;

  /** Drops whatever is still waiting for a session that has ended. */
  forget(sessionId: SessionId): void;
}

export const SESSION_PERMISSION_GATE = Symbol('SessionPermissionGate');
