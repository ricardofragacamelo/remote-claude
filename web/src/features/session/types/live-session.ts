import type { TurnCompletedPayloadUsage } from '@remote-claude/contracts';

import type { QuestionAnswer, QuestionInteraction } from '@/features/permission';
import type { ToolCall } from '@/shared/lib/tool-call';

/** Where a session is, as the contract's `session.statusChanged` reports it. */
export type SessionStatus =
  'starting' | 'idle' | 'thinking' | 'running' | 'waitingPermission' | 'closed';

/** Why a session ended. The contract carries the same six. */
export type SessionCloseReason =
  'closedByUser' | 'completed' | 'failed' | 'auditUnavailable' | 'shutdown' | 'idleTimeout';

/**
 * What one block of a message is: the answer, the model's thinking, thinking it would not show, or an
 * image the prompt carried — a marker of it, never its bytes (plan 22, D-09).
 */
export type BlockKind = 'text' | 'thinking' | 'redactedThinking' | 'image';

/** One finished block of a message, in the order the model wrote it. */
export interface MessageBlock {
  readonly kind: BlockKind;

  /** The text of the block — empty for a thinking the model omitted or redacted. */
  readonly text: string;

  /**
   * The block's identity, `<entry>:<index>` — the same live and in the history (plan 22, D-06). Two
   * blocks equal in kind and text are still two when their ids differ. Absent from an older server.
   */
  readonly blockId?: string;

  /**
   * How long, **at most**, the model thought before this block — from the `at` of the entry before it
   * to its own, read off the history (plan 22, D-14). The `at` marks when an entry was written, which
   * is after the first token, so it is an upper bound and says so. Absent live, where the stream
   * measures it, and from the history without both instants.
   */
  readonly atMostMs?: number;

  /** The type of an image, as the prompt declared it — absent when it did not. */
  readonly mediaType?: string;

  /** The size of an image, in bytes — absent for an image given by URL. */
  readonly size?: number;
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
 * One tool, running on the user's own machine, as the contract describes it — its kind, the label
 * the server built, what it is about and the files it changes (plan 28, B-18).
 *
 * The **exact** input is kept, never a summary of it: somebody watching a command run on their
 * laptop is entitled to see the command.
 */
export interface ToolExecution extends ToolCall {
  readonly toolUseId: string;
  readonly status: ToolStatus;

  /**
   * How long it has been running, as `tool.progress` last said it. The engine reports elapsed time
   * while a tool runs, not its output — measured, plan 08 (B-18) — so this replaces, never appends.
   */
  readonly elapsed: string | null;

  /** What `tool.completed` said about it, when it said anything — the start of its output. */
  readonly summary: string | null;

  /** The tool that opened the subagent this invocation is of — `null` on the main conversation. */
  readonly parentToolUseId: string | null;

  /**
   * The description the model gave the call (`tool.started.title`, plan 22, D-05) — what the row is
   * named by. Absent when it gave none, and from an older server.
   */
  readonly title?: string;

  /**
   * The question of a call of kind `question`, as `tool.completed` carried it: the questions and
   * what this backend recorded of how they ended (plan 24, B-22). Absent from any other tool, and
   * from an older server.
   */
  readonly question?: ToolQuestion;
}

/** Where a task of the agent's list is, as `session.tasksChanged` says it (plan 28, B-22). */
export type TaskStatus = 'pending' | 'inProgress' | 'completed';

/** One task of the agent's list, as the server read it from the agent's own calls. */
export interface AgentTask {
  /** Opaque and stable for the life of the task — what two lists are compared by. */
  readonly id: string;
  readonly title: string;

  /** What it is called while it runs ("Running the tests") — `null` when the agent gave none. */
  readonly activeTitle: string | null;
  readonly status: TaskStatus;
}

/**
 * The agent's task list as the last `session.tasksChanged` left it — the whole list, never rebuilt
 * here from the calls (plan 28, B-22) — and the list before it, which says what the last change moved.
 */
export interface TaskList {
  readonly tasks: readonly AgentTask[];
  readonly previous: readonly AgentTask[];
}

/** How a question of the agent ended, as the contract says it. */
export type QuestionOutcome = 'answered' | 'declined' | 'expired';

/** A question of the agent as the history carries it (plan 24, B-21). */
export interface ToolQuestion {
  readonly interaction: QuestionInteraction;

  /** How it ended — `null` with no record of it here: answered in another client, say. */
  readonly outcome: QuestionOutcome | null;
  readonly answers: readonly QuestionAnswer[] | null;

  /** Why it was refused, on `declined`. */
  readonly reason: string | null;
}

/** A prompt waiting for the running turn to end — the backend's queue (plan 08, D-14). */
export interface QueuedPrompt {
  readonly queueId: string;

  /** The kind of client that sent it — `web` or `mobile`. */
  readonly promptedBy: string;

  /** The start of what was typed. */
  readonly preview: string;
}

/**
 * What a turn used, in our names (plan 28, B-29) — each count only when the engine reports it, and
 * shown only then: the contract's own shape.
 */
export type TurnUsage = TurnCompletedPayloadUsage;

/** What a finished turn cost. */
export interface TurnSummary {
  readonly turnId: string;

  /** In US dollars, as text — `null` when the engine reports no cost (S-86); zero is zero (S-87). */
  readonly costUsd: string | null;
  readonly durationMs: number;

  /** `null` for a turn that reported no count at all — interrupted, or an engine that counts none. */
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
    }
  | {
      /** The files of the session were put back (plan 09, B-28). */
      readonly kind: 'rewound';
      readonly id: string;

      /** Put back, or deleted because the turn had created them. */
      readonly restored: number;

      /** Left as they were, each with its reason. */
      readonly kept: number;
      readonly failed: number;
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

  /**
   * The agent's task list, as the last `session.tasksChanged` heard said it — `null` before any, and
   * for an engine that keeps none.
   */
  readonly taskList: TaskList | null;

  /**
   * When the turn running began, by the server's clock — `null` with no turn running, and from the
   * history, which keeps no instant (plan 09, B-21).
   */
  readonly turnSince: string | null;

  /**
   * When the last entry of the history folded so far was written (its `at`) — what the upper bound of
   * the next thinking is read from (plan 22, D-14). Absent before the first, and on the live stream,
   * whose frames carry no `at`.
   */
  readonly writtenAt?: string;
}
