import type { ConversationSummary } from './history';
import type { SessionStatus } from './live-session';

/** One live session of a folder, as `GET /sessions?workspacePath=` answers it (plan 08, B-07). */
export interface LiveSessionSummary {
  readonly sessionId: string;

  /** The conversation in Claude's store this session is. */
  readonly claudeSessionId: string;

  /** The conversation it continues, when it is a resume. */
  readonly resumedFrom: string | null;

  /** Where it runs — the folder of the tab, or one below it. */
  readonly workspacePath: string;
  readonly status: SessionStatus;
  readonly model: string;
  readonly permissionMode: string;

  /** ISO 8601. */
  readonly startedAt: string;

  /** Which client opened it — "opened on your phone" is something the row can say. */
  readonly openedFrom: 'web' | 'mobile';

  /** How many questions it is waiting on a person for. */
  readonly pendingPermissions: number;
}

/** A page of the conversations of a folder, as the history lists them. */
export interface FolderConversationPage {
  readonly conversations: readonly ConversationSummary[];
  readonly nextCursor: string | null;
}

/** The three groups of the view, in the order they are shown. */
export const SESSION_GROUPS = ['running', 'elsewhere', 'history'] as const;
export type SessionGroup = (typeof SESSION_GROUPS)[number];

/** Which origins the history shows. */
export type OriginFilter = 'all' | 'ours' | 'external';

/** How the rows of a group are ordered. */
export type SessionSort = 'recent' | 'name';
