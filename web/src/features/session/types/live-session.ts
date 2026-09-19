/** Where a session is, as the contract's `session.statusChanged` reports it. */
export type SessionStatus =
  'starting' | 'idle' | 'thinking' | 'running' | 'waitingPermission' | 'closed';

/** Why a session ended. The contract carries the same five. */
export type SessionCloseReason =
  'closedByUser' | 'completed' | 'failed' | 'auditUnavailable' | 'shutdown';

/**
 * One message of the conversation.
 *
 * `text` is what has arrived so far. While `isComplete` is false it is the accumulation of the
 * deltas of this `messageId`, and nothing else — accumulating in arrival order across messages is
 * how two answers in flight end up as one paragraph of nonsense.
 */
export interface StreamMessage {
  readonly messageId: string;
  readonly role: 'assistant' | 'user';
  readonly text: string;

  /** `message.completed` arrived, and replaced whatever the deltas had built. */
  readonly isComplete: boolean;
}

/** How a tool invocation ended, when it has. */
export type ToolStatus = 'running' | 'succeeded' | 'failed' | 'denied';

/**
 * One tool, running on the user's own machine.
 *
 * The **exact** input is kept, never a summary of it: somebody watching a command run on their
 * laptop is entitled to see the command.
 */
export interface ToolExecution {
  readonly toolUseId: string;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly status: ToolStatus;

  /** Everything `tool.progress` has sent, in order. */
  readonly output: string;

  /** What `tool.completed` said about it, when it said anything. */
  readonly summary: string | null;
}

/** What a finished turn cost. */
export interface TurnSummary {
  readonly turnId: string;
  readonly costUsd: string;
  readonly durationMs: number;
}

/** How a session ended, for a screen opened after the fact. */
export interface SessionEnding {
  readonly reason: SessionCloseReason;
  readonly at: string;
}

/**
 * The part of a session's state that a frame can change.
 *
 * Named separately from the store so the reducer can live in a service without the service
 * importing the store — which would be a cycle, and would also put Zustand on the wrong side of
 * the chain (docs/architecture/web/01-architecture.md).
 */
export interface Conversation {
  readonly status: SessionStatus;
  readonly messages: readonly StreamMessage[];
  readonly tools: readonly ToolExecution[];
  readonly lastTurn: TurnSummary | null;
  readonly ending: SessionEnding | null;
}
