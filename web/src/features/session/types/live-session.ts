/** Where a session is, as the contract's `session.statusChanged` reports it. */
export type SessionStatus =
  'starting' | 'idle' | 'thinking' | 'running' | 'waitingPermission' | 'closed';

/** Why a session ended. The contract carries the same six. */
export type SessionCloseReason =
  'closedByUser' | 'completed' | 'failed' | 'auditUnavailable' | 'shutdown' | 'idleTimeout';

/** What one block of a message is: the answer, the model's thinking, or thinking it would not show. */
export type BlockKind = 'text' | 'thinking' | 'redactedThinking';

/** One finished block of a message, in the order the model wrote it. */
export interface MessageBlock {
  readonly kind: BlockKind;

  /** The text of the block — empty for a thinking the model omitted or redacted. */
  readonly text: string;
}

/**
 * One message of the conversation.
 *
 * The CLI sends a message one **block** at a time — a `message.completed` per block, all under one
 * `messageId` — so a message is the blocks finished so far, in order, plus the one still streaming.
 * The deltas of one `messageId` accumulate there and nowhere else: accumulating in arrival order
 * across messages is how two answers in flight end up as one paragraph of nonsense.
 */
export interface StreamMessage {
  readonly messageId: string;
  readonly role: 'assistant' | 'user';

  /** The answer as text: the `text` blocks finished and streaming, joined — what "copy" copies. */
  readonly text: string;
  readonly blocks: readonly MessageBlock[];

  /** The block arriving now, fragment by fragment — `null` once it finished. */
  readonly streaming: { readonly kind: 'text' | 'thinking'; readonly text: string } | null;

  /** Every block that started has finished. */
  readonly isComplete: boolean;

  /** The tool that opened the subagent this message is of — `null` on the main conversation. */
  readonly parentToolUseId: string | null;

  /**
   * How long it thought, in milliseconds, measured on the stream — `null` from the history, which
   * keeps no time per block, and while it is still thinking.
   */
  readonly thinkingMs: number | null;

  /** When the thinking began, by the server's clock — what the duration is measured from. */
  readonly thinkingSince: string | null;
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

  /**
   * How long it has been running, as `tool.progress` last said it. The SDK reports elapsed time
   * while a tool runs, not its output — measured, plan 08 (B-18) — so this replaces, never appends.
   */
  readonly elapsed: string | null;

  /** What `tool.completed` said about it, when it said anything — the start of its output. */
  readonly summary: string | null;

  /** The tool that opened the subagent this invocation is of — `null` on the main conversation. */
  readonly parentToolUseId: string | null;

  /** The task of the list a `TaskCreate` made or a `TaskUpdate` changed, once it ended (B-20). */
  readonly taskId: string | null;
}

/** The tokens a turn used, as the SDK reports them. */
export interface TurnUsage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/** What a finished turn cost. */
export interface TurnSummary {
  readonly turnId: string;
  readonly costUsd: string;
  readonly durationMs: number;

  /** `null` for a turn that ended with no usage — interrupted before the model answered. */
  readonly usage: TurnUsage | null;
}

/** How a session ended, for a screen opened after the fact. */
export interface SessionEnding {
  readonly reason: SessionCloseReason;
  readonly at: string;
}

/**
 * One thing that happened, in the order it happened — what the conversation is drawn from.
 *
 * Messages, tools and the end of each turn **interleave**: an answer, the tool it ran, the answer
 * after it. Two lists drawn one after the other would put every tool after every message.
 */
export type TimelineEntry =
  | { readonly kind: 'message'; readonly id: string }
  | { readonly kind: 'tool'; readonly id: string }
  | { readonly kind: 'turn'; readonly id: string }
  | {
      readonly kind: 'compacted';
      readonly id: string;
      readonly trigger: string;
      readonly preTokens: number | null;
    };

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
  readonly timeline: readonly TimelineEntry[];

  /** Every turn this session saw end, oldest first — one each, however often it was delivered. */
  readonly turns: readonly TurnSummary[];
  readonly lastTurn: TurnSummary | null;
  readonly ending: SessionEnding | null;
}
