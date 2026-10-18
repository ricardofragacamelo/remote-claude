import type { CanonicalTool } from '@domain/engine';
import type { SessionId } from '@domain/session';

/** One invocation of a tool, as the `PreToolUse` hook reports it. */
export interface ToolInvocation {
  readonly sessionId: SessionId;

  /** The engine's id for this invocation, when it gave one. */
  readonly toolUseId: string | null;

  readonly toolName: string;

  /** The exact input the tool was called with. Never summarised — the trail is the record. */
  readonly input: Readonly<Record<string, unknown>>;

  /**
   * The call as the core reads it (plan 28, B-16). The name and the input above go to the rules
   * and to the trail alone.
   */
  readonly tool: CanonicalTool;

  /**
   * The turn this invocation belongs to.
   *
   * The engine correlates a prompt with every event until the next one, so the turn of an invocation
   * is known without reading the transcript.
   */
  readonly promptId: string | null;

  readonly at: Date;
}

/**
 * Who is told about every tool invocation.
 *
 * It is anchored on the `PreToolUse` hook and **not** on `canUseTool`, and the difference is the
 * whole point: the hook fires for every tool, the callback only for the ones that need a human.
 * Measured in the same session — 6 tool calls, 6 hooks, 2 `canUseTool`. A trail hung on the
 * callback would miss every file read and every auto-approved command
 * ([ADR-011](../../../../docs/architecture/shared/00-decisions.md)).
 *
 * The recorder may **refuse**: a rejected promise stops the tool. Without a trail there is no
 * authorisation — see docs/architecture/backend/03-modules.md#audit.
 */
export interface ToolInvocationRecorder {
  record(invocation: ToolInvocation): Promise<void>;
}

export const TOOL_INVOCATION_RECORDER = Symbol('ToolInvocationRecorder');
