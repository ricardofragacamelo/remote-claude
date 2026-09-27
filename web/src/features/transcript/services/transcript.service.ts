import { toConversationSummary } from '@/features/session';
import type { ConversationSummary } from '@/features/session';
import { api } from '@/shared/api/api';
import type { ConversationListPage } from '../types/transcript';

/** The shape the backend answers with. It stops existing at the end of this file. */
interface ConversationListResponse {
  readonly sessions?: unknown;
  readonly nextCursor?: unknown;
}

/**
 * One page of the conversations of one workspace — ours and the ones begun elsewhere.
 *
 * **One** directory, exactly: a conversation opened in a folder inside it is listed under that
 * folder, not here — the SDK does not descend, and listing the whole store is what the allowlist
 * fence refuses ([D-01](../../../../../docs/plans/04-transcript-and-resume/decisions.md)). The
 * cursor is opaque and goes back as it came; paging is by cursor because the order moves while a
 * conversation is being written.
 *
 * An entry this build cannot read is dropped rather than thrown over: one malformed row in a list
 * of twenty-five should cost the person that row, not the screen.
 *
 * @throws {import('@/shared/api/errors').AppError} `WORKSPACE_NOT_ALLOWED` / `FORBIDDEN` for a
 *   folder outside the caller's roots, `CLAUDE_UNAVAILABLE` / `CLAUDE_TIMEOUT` when the SDK failed
 */
export async function fetchConversations(
  workspacePath: string,
  cursor: string | null,
): Promise<ConversationListPage> {
  const query = new URLSearchParams({ workspacePath });

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
