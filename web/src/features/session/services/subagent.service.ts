import { api } from '@/shared/api/api';
import type { HistoryEvent } from '../types/history';
import { toHistoryEvents } from './history.service';

/** A page of what a subagent said, oldest first, and the cursor of the page before it. */
export interface SubagentPage {
  readonly events: readonly HistoryEvent[];
  readonly nextCursor: string | null;
}

interface SubagentPageResponse {
  readonly events?: unknown;
  readonly nextCursor?: unknown;
}

/**
 * What the subagent a tool opened said — read from the history when its row is unfolded (plan 08,
 * B-21): the main transcript holds the tool and its result, and the subagent's own messages are kept
 * apart.
 *
 * @throws {import('@/shared/api/errors').AppError} `NOT_FOUND` for a subagent the conversation does
 *   not have, or a conversation the caller does not read (S-91)
 */
export async function fetchSubagentPage(
  conversationId: string,
  toolUseId: string,
): Promise<SubagentPage> {
  const body = await api.get<SubagentPageResponse>(
    `/transcripts/${encodeURIComponent(conversationId)}/subagents/${encodeURIComponent(toolUseId)}/messages`,
  );

  return {
    events: toHistoryEvents(body.events),
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
  };
}
