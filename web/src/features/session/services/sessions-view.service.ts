import { api } from '@/shared/api/api';
import { isRecord, readText } from '@/shared/lib/json';
import type { ConversationSummary } from '../types/history';
import type { SessionStatus } from '../types/live-session';
import type {
  FolderConversationPage,
  LiveSessionSummary,
  OriginFilter,
  SessionSort,
} from '../types/sessions-view';
import { toConversationSummary } from './history.service';
import { folded } from '@/shared/lib/folded';

/** The shapes the backend answers with. They stop existing at the end of this file. */
interface LiveSessionsResponse {
  readonly sessions?: unknown;
}
interface ConversationListResponse {
  readonly sessions?: unknown;
  readonly nextCursor?: unknown;
}

/**
 * The live sessions of this person in a folder and in every folder below it (plan 08, B-07).
 *
 * A row this build cannot read is dropped rather than thrown over: one malformed row should cost the
 * person that row, not the view.
 *
 * @throws {import('@/shared/api/errors').AppError} `WORKSPACE_NOT_ALLOWED` / `FORBIDDEN` for a
 *   folder outside the caller's roots, `WORKSPACE_NOT_FOUND` for one that is gone
 */
export async function fetchLiveSessions(
  workspacePath: string,
): Promise<readonly LiveSessionSummary[]> {
  const body = await api.get<LiveSessionsResponse>(
    `/sessions?${new URLSearchParams({ workspacePath }).toString()}`,
  );

  return Array.isArray(body.sessions) ? body.sessions.flatMap(toLiveSession) : [];
}

/**
 * One page of the conversations of a folder — exactly the folder, or the folder and the ones below
 * it when asked (plan 08, D-05) — each with what it is doing now.
 *
 * The cursor is opaque and goes back as it came; paging is by cursor because the order moves while
 * a conversation is being written.
 *
 * @throws {import('@/shared/api/errors').AppError} as {@link fetchLiveSessions}, and
 *   `CLAUDE_UNAVAILABLE` / `CLAUDE_TIMEOUT` when the SDK failed
 */
export async function fetchFolderConversations(
  workspacePath: string,
  cursor: string | null,
  includeSubfolders: boolean,
): Promise<FolderConversationPage> {
  const query = new URLSearchParams({ workspacePath });

  if (includeSubfolders) {
    query.set('includeSubfolders', 'true');
  }
  if (cursor !== null) {
    query.set('cursor', cursor);
  }

  const body = await api.get<ConversationListResponse>(`/transcripts?${query.toString()}`);

  return {
    conversations: Array.isArray(body.sessions)
      ? body.sessions.flatMap((entry): ConversationSummary[] => {
          const summary = toConversationSummary(entry);
          return summary === null ? [] : [summary];
        })
      : [],
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
  };
}

const STATUSES: ReadonlySet<string> = new Set([
  'starting',
  'idle',
  'thinking',
  'running',
  'waitingPermission',
  'closed',
]);

/** The four fields a live session cannot be read without, or `null` when one is missing. */
function identityOf(value: Readonly<Record<string, unknown>>):
  | (Pick<LiveSessionSummary, 'sessionId' | 'claudeSessionId' | 'workspacePath'> & {
      readonly status: string;
    })
  | null {
  const sessionId = readText(value, 'sessionId');
  const claudeSessionId = readText(value, 'claudeSessionId');
  const workspacePath = readText(value, 'workspacePath');
  const status = readText(value, 'status');

  return sessionId === null || claudeSessionId === null || workspacePath === null || status === null
    ? null
    : { sessionId, claudeSessionId, workspacePath, status };
}

/** One live session as the backend describes it, or nothing when the entry is not one. */
function toLiveSession(value: unknown): LiveSessionSummary[] {
  const identity = isRecord(value) ? identityOf(value) : null;

  if (identity === null || !isRecord(value)) {
    return [];
  }

  const pending = value['pendingPermissions'];

  return [
    {
      ...identity,
      resumedFrom: readText(value, 'resumedFrom'),
      status: STATUSES.has(identity.status) ? (identity.status as SessionStatus) : 'idle',
      model: readText(value, 'model') ?? '',
      permissionMode: readText(value, 'permissionMode') ?? '',
      startedAt: readText(value, 'startedAt') ?? '',
      openedFrom: readText(value, 'openedFrom') === 'mobile' ? 'mobile' : 'web',
      pendingPermissions: typeof pending === 'number' ? pending : 0,
    },
  ];
}

/** What the person narrowed the view to. */
export interface SessionsFilter {
  /** Matched against the title, case and accents aside. Empty matches everything. */
  readonly search: string;
  readonly origin: OriginFilter;
  readonly sort: SessionSort;
}

/** Whether a conversation passes the search and the origin of the filter. */
export function matchesConversation(
  conversation: ConversationSummary,
  filter: SessionsFilter,
): boolean {
  const byOrigin = filter.origin === 'all' || conversation.origin === filter.origin;

  return byOrigin && folded(conversation.summary).includes(folded(filter.search.trim()));
}

/**
 * The conversations of a group, filtered and in the order asked — each once, however many pages
 * and refreshes brought it: the newest copy of a row wins (plan 08, S-50).
 */
export function arrangeConversations(
  conversations: readonly ConversationSummary[],
  filter: SessionsFilter,
): ConversationSummary[] {
  const latest = new Map<string, ConversationSummary>();

  for (const conversation of conversations) {
    latest.set(conversation.conversationId, conversation);
  }

  const kept = [...latest.values()].filter((conversation) =>
    matchesConversation(conversation, filter),
  );

  return filter.sort === 'name'
    ? kept.sort((left, right) => left.summary.localeCompare(right.summary))
    : kept.sort((left, right) => right.lastModified.localeCompare(left.lastModified));
}

/** The live sessions a filter keeps — by the search, on the folder they run in — in the order asked. */
export function arrangeLiveSessions(
  sessions: readonly LiveSessionSummary[],
  filter: SessionsFilter,
  titleOf: (session: LiveSessionSummary) => string,
): LiveSessionSummary[] {
  const kept = sessions.filter((session) =>
    folded(titleOf(session)).includes(folded(filter.search.trim())),
  );

  return filter.sort === 'name'
    ? kept.sort((left, right) => titleOf(left).localeCompare(titleOf(right)))
    : kept.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}
