import type { PermissionRequest, QuestionAnswer } from '@domain/permission';
import type { PermissionMode, SessionId } from '@domain/session';
import type { CanonicalTool } from '@domain/engine';

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

  /**
   * What the adapter of the engine read the call as (plan 28, B-16) — what the request is shown and
   * graded by.
   */
  readonly tool: CanonicalTool;

  /** The SDK's cancellation. It fires when the session dies with a request still open. */
  readonly signal: AbortSignal;
}

/** The answer, in the only two values the loop understands. */
export interface PermissionVerdict {
  readonly decision: 'allow' | 'deny';

  /** Why it was refused. It goes back to Claude as a message, so it is never empty on a `deny`. */
  readonly reason: string | null;

  /**
   * What the person answered, on an `allow` of a question — by the id of each question, as the
   * product carries it. The SDK's shape is the runner's to build: this port does not know it
   * ([24 · D-03](../../../../../docs/plans/24-structured-questions/decisions.md)). `null` otherwise.
   */
  readonly answers: readonly QuestionAnswer[] | null;
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

  /**
   * The session switched mode. Switching to Permitir tudo answers the questions already open that
   * no rule refuses and that are not questions for the person (plan 23, D-06); any other switch
   * changes nothing until the next tool. Never rejects: the mode has already changed.
   */
  modeChanged(sessionId: SessionId, mode: PermissionMode): Promise<void>;
}

export const SESSION_PERMISSION_GATE = Symbol('SessionPermissionGate');

/** A permission request that has just been settled — the request, with its resolution on it. */
export interface SettledPermission {
  readonly request: PermissionRequest;
}

/**
 * How the agent loop held on a request is let go (plan 28, B-34).
 *
 * The other half of {@link SessionPermissionGate}: the gate holds the loop open on a question, and
 * this releases it when the request is settled — by a person on any device, a rule, a deadline, or
 * its session ending — so there is exactly one way out of a pending request. The adapter of the
 * engine implements it, the composition provides it, and the consumer of `permission.resolved`
 * calls it without knowing which engine is behind it.
 *
 * Called for every settlement, including the ones no loop of this process is held on — a rule that
 * answered before anybody was asked, a request of another session — and those change nothing.
 */
export interface AgentLoopRelease {
  onResolved(settled: SettledPermission): void;
}

export const AGENT_LOOP_RELEASE = Symbol('AgentLoopRelease');
