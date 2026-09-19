import type { PermissionMode, SessionCloseReason, SessionId } from '@domain/session';
import type { WorkspacePath } from '@domain/workspace';

/**
 * One event of our own contract, on its way out of the adapter.
 *
 * It is **not** an `SDKMessage`. The SDK's type has around 38 variants and the package is still on
 * `0.3.x`; emitting it raw would make every client a hostage of its next release
 * ([ADR-006](../../../../docs/architecture/shared/00-decisions.md)). The translation happens in
 * `adapter/outbound/claude/sdk-message.mapper.ts`, and nothing outside that folder ever sees the
 * SDK's shape.
 */
export interface SessionEvent {
  /** A `type` of the generated contract, such as `message.delta`. */
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Everything the adapter needs in order to open a session. */
export interface ClaudeSessionStart {
  readonly sessionId: SessionId;
  readonly workspace: WorkspacePath;

  /** Model to open with, or `null` for whatever the installation defaults to. */
  readonly model: string | null;

  readonly permissionMode: PermissionMode;

  /** Session of the Agent SDK to continue, or `null` to start fresh. */
  readonly resumeSessionId: string | null;

  /** Called for every event the stream produced, in order. */
  onEvent(event: SessionEvent): void;

  /** Called once, when the stream ends — for any reason, including a crash. */
  onClosed(reason: SessionCloseReason): void;
}

/**
 * A session that is running, as the application drives it.
 *
 * Every method is a control request, and control requests only exist because the prompt is a
 * streaming input rather than a string — see
 * docs/architecture/backend/04-claude-integration.md#streaming-input-mode--obrigatório.
 */
export interface ClaudeSessionHandle {
  /**
   * Queues a turn.
   *
   * It does not wait: a prompt that arrives while a turn is running is **queued** and runs next,
   * which is what the SDK already does and what the Claude Code UI does. Refusing it with a
   * conflict was our own policy and it was the wrong one.
   */
  prompt(text: string): void;

  interrupt(): Promise<void>;
  setModel(model: string): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;

  /**
   * Ends the session and releases its subprocess.
   *
   * Idempotent, because it runs from a command, from a `finally` and from the shutdown hook, and
   * any two of those can happen at once. A leaked subprocess does not die on its own, and this one
   * runs on the machine of whoever installed the product.
   */
  close(): Promise<void>;
}

/** How a session of Claude is opened. The only door to the Agent SDK. */
export interface ClaudeSessionPort {
  start(input: ClaudeSessionStart): Promise<ClaudeSessionHandle>;
}

export const CLAUDE_SESSION_PORT = Symbol('ClaudeSessionPort');
