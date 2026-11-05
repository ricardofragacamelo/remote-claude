import type { TurnCompletedPayload, TurnCompletedPayloadUsage } from '@remote-claude/contracts';

import type { QuestionAnswer, QuestionInteraction } from '@/features/permission';
import type { ToolCall } from '@/shared/lib/tool-call';

/** Where a session is, as the contract's `session.statusChanged` reports it. */
export type SessionStatus =
  'starting' | 'idle' | 'thinking' | 'running' | 'waitingPermission' | 'closed';

/** Why a session ended. The contract carries the same six. */
export type SessionCloseReason =
  'closedByUser' | 'completed' | 'failed' | 'auditUnavailable' | 'shutdown' | 'idleTimeout';

/**
 * What one block of a message is: the answer, the model's thinking, thinking it would not show, an
 * image the prompt carried — a marker of it, never its bytes (plan 22, D-09) —, or a block of a kind
 * this build does not know, drawn generically rather than dropped (plan 27, F6 · B-20, U-05/U-08).
 */
export type BlockKind = 'text' | 'thinking' | 'redactedThinking' | 'image' | 'unknown';

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

  /** The block's own `type`, for a `kind: 'unknown'` block — what the generic line names (U-05). */
  readonly blockType?: string;
}

/** The four levels a notice carries — the contract's own (`session.notice.level`). */
export type NoticeLevel = 'info' | 'notice' | 'warning' | 'error';

/**
 * Why a line is the generic one rather than something this build understood — `undefined` for a
 * notice the backend itself marked `kind: 'unknown'` (B-13), which needs no reason of its own.
 *
 * `unknownEvent` — a WS event type with no reader and not in the silent list (U-06, D-02).
 * `unknownValue` — a known event with an enum value this build does not recognise (U-07).
 * `malformed` — a known event missing a field its payload requires (U-09).
 * `unknownNotice` — a `session.notice.kind` this build does not have a line for (U-11).
 */
export type UnknownReason = 'unknownEvent' | 'unknownValue' | 'malformed' | 'unknownNotice';

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

  /** Media the result carried besides its text (plan 27, F6 · B-22) — never raw bytes: an `image`
   * is fetched by the same route a prompt's image uses, a `link` is text unless its scheme is safe,
   * and a kind this build does not know draws the generic line (B-20). Absent from a call that
   * finished with no attachment, and from an older server. */
  readonly attachments?: readonly ToolAttachment[];
}

/** One attachment a tool's result carried (plan 27, F6 · B-22) — the contract's own shape. */
export type ToolAttachment =
  | {
      readonly kind: 'image';
      readonly blockId?: string;
      readonly mediaType?: string;
      readonly size?: number;
    }
  | { readonly kind: 'link'; readonly uri?: string; readonly title?: string }
  | { readonly kind: 'unknown'; readonly type?: string };

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

/**
 * How a turn ended — never the engine's own name for it (ADR-025). Only `completed` is a turn that
 * ran to the end; the other three still carry whatever the engine reports, which a crash may leave
 * zeroed (plan 27, B-10).
 */
export type TurnOutcome = TurnCompletedPayload['outcome'];

/** What a finished turn cost. */
export interface TurnSummary {
  readonly turnId: string;
  readonly outcome: TurnOutcome;

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

      /** The `compactionId` the backend gave it (plan 27, F3 · B-09, F5 · B-18) — stable live, on
       * replay and from the history, what lets two compactions of the same conversation be told
       * apart. Falls back to `seq ?? frame.id` from a server older than it. */
      readonly id: string;
      readonly trigger: string;
      readonly preTokens: number | null;

      /** The compaction's own summary — the `message.completed` with `injected.kind:
       * 'contextSummary'` that follows it, folded in here rather than drawn as its own message
       * (plan 27, F6 · B-21): a summary nobody wrote is not "You" saying it. `null` until it
       * arrives, or from a server that sends none. */
      readonly summary: string | null;
    }
  | {
      /**
       * Something the agent put in the conversation itself, never the person's own words (plan 27,
       * F6 · B-21): a skill's body (`injected.kind: 'instructions'`), or one of a kind this build
       * draws no line of its own for (`'other'`) — a `commandExpansion` is never one of these, since
       * it is meant to read as the prompt it expands to, and still shows as the person's own.
       */
      readonly kind: 'injected';
      readonly id: string;
      readonly injectedKind: 'instructions' | 'other';
      readonly name: string | null;
      readonly parentToolUseId: string | null;
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
    }
  | {
      /**
       * A `session.notice`, or a line this build draws in its place (plan 27, F6 · B-19, B-20): a WS
       * event with no reader, a known event an enum value of which this build does not recognise, a
       * known event missing a field it requires, or a notice of a `kind` this build has no line for.
       * The same row draws all four — a line genuinely unknown to a published client is not a
       * different kind of thing from one the backend itself could not place.
       */
      readonly kind: 'notice';
      readonly id: string;

      /** The notice's own `kind` — absent for a line this build synthesised itself (`reason` says
       * why), present and possibly unrecognised for one the backend actually sent. */
      readonly noticeKind?: string;
      readonly reason?: UnknownReason;
      readonly level: NoticeLevel;

      /** Set when the text is ours: an i18n key the client translates, paired with `params` — never
       * together with `text`. */
      readonly messageKey?: string;
      readonly params?: Readonly<Record<string, unknown>>;

      /** Set when the text is the agent's, a hook's or a command's own — untrusted prose, shown as
       * plain text (safe markdown only for `command.output`), never translated. */
      readonly text: string | null;
      readonly truncated: boolean;

      /** The subagent this notice belongs to — `null` for the main conversation. */
      readonly parentToolUseId: string | null;

      /** What a synthesised line names: the WS event type, the enum field, or the notice `kind`. */
      readonly detail?: string;

      /** How many times in a row the identical backend `kind: 'unknown'` notice arrived (D-12) — the
       * "×3" counter. Absent, or `1`, for everything else: a synthesised line is never counted this
       * way (U-06 shows at most once per type per session on its own). */
      readonly count?: number;
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
