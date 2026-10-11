import type { SubagentPagePayload } from '@remote-claude/contracts';

import { api } from '@/shared/api/api';
import type { ConversationRef } from '@/shared/lib/conversation';
import type { Unchecked } from '@/shared/lib/json';
import type { HistoryEvent } from '../types/history';
import { toHistoryEvents, transcriptPath } from './history.service';

/** A page of what a subagent said, oldest first, and the cursor of the page before it. */
export interface SubagentPage {
  readonly events: readonly HistoryEvent[];
  readonly nextCursor: string | null;
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
  conversation: ConversationRef,
  toolUseId: string,
): Promise<SubagentPage> {
  const body = await api.get<Unchecked<SubagentPagePayload>>(
    transcriptPath(conversation, 'subagents', toolUseId, 'messages'),
  );

  return {
    events: toHistoryEvents(body.events),
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
  };
}
