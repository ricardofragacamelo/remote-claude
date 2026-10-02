import type { TaskList } from '../../lib/task-list';
import type { Conversation, StreamMessage } from '../../types/live-session';

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

  /** Edits a prompt to send it again — a fork from before it (plan 08, B-35); absent reading. */
  readonly onEditPrompt?: ((message: StreamMessage) => void) | undefined;

  /** Forks from before a prompt and sends it again, unchanged (B-35). */
  readonly onForkFrom?: ((message: StreamMessage) => void) | undefined;
}
