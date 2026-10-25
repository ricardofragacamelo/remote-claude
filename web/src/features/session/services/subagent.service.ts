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
 * @param workspaceHint the folder the caller already believes the conversation runs in — a
 *   transcript heavy enough can push the line the engine reads a folder from out of its own id-only
 *   lookup; this is never trusted on its own, only used to ask the right folder first (S-163)
 * @throws {import('@/shared/api/errors').AppError} `NOT_FOUND` for a subagent the conversation does
 *   not have, or a conversation the caller does not read (S-91)
 */
export async function fetchSubagentPage(
  conversation: ConversationRef,
  toolUseId: string,
  workspaceHint?: string,
): Promise<SubagentPage> {
  const path = transcriptPath(conversation, 'subagents', toolUseId, 'messages');
  const body = await api.get<Unchecked<SubagentPagePayload>>(
    workspaceHint === undefined
      ? path
      : `${path}?workspacePath=${encodeURIComponent(workspaceHint)}`,
  );

  return {
    events: toHistoryEvents(body.events),
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
  };
}
