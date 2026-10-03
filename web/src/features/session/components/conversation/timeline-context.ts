import type { PlanMode } from '@/features/permission';
import type { InlineRequests } from '../../hooks/useInlineRequests';
import type { TaskList } from '../../lib/task-list';
import type { Conversation, StreamMessage } from '../../types/live-session';

/** The questions of a live session, and what their cards need — drawn in the conversation. */
export interface InlineContext {
  readonly requests: InlineRequests;

  /** The folder of the tab — what a pending edit is previewed against. */
  readonly folder: string;

  /** Where the rules a "don't ask again" leaves are taken back. */
  readonly onOpenRules?: (() => void) | undefined;

  /** A plan was approved, to go on in this mode — the chip of the bar follows (plan 09, B-24). */
  readonly onPlanApproved?: ((mode: PlanMode) => void) | undefined;
}

/** A prompt of the conversation, and what can be done from it (plan 09, B-27). */
export interface PromptActions {
  /** Edits a prompt to send it again — a fork from before it (plan 08, B-35). */
  readonly onEdit?: ((message: StreamMessage) => void) | undefined;

  /** Forks from before a prompt and sends it again, unchanged (B-35). */
  readonly onFork?: ((message: StreamMessage) => void) | undefined;

  /** Opens the undo of the files, at the turn of this prompt — absent where there is no undo. */
  readonly onUndo?: ((message: StreamMessage) => void) | undefined;

  /** Why the undo cannot be asked for now — a turn running —, or `null` when it can. */
  readonly undoBlocked?: string | null | undefined;
}

/** What every row of a conversation needs to know about where it is drawn. */
export interface TimelineContext {
  /** The real path of the folder of the tab — `''` when there is none. */
  readonly folder: string;

  /** The live session, for the way to its trail — `null` reading the history. */
  readonly sessionId: string | null;

  /** The conversation in Claude's store, for what the history keeps apart — a subagent. */
  readonly conversationId: string | null;

  /** The whole conversation, so a subagent's tool finds what the stream nested under it. */
  readonly conversation: Pick<Conversation, 'messages' | 'tools' | 'timeline' | 'turns'>;

  /** The message the search is on, so it is marked. */
  readonly current: string | null;

  /** The task list the conversation's tools made — which of their calls it read (B-20). */
  readonly taskList: TaskList;

  /** What can be done from a prompt — absent reading the history. */
  readonly prompts?: PromptActions | undefined;

  /** The questions of the session, in the place of their tools — absent reading the history. */
  readonly inline?: InlineContext | undefined;
}
