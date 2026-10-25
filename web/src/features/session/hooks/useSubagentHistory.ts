import { skipToken, useQuery } from '@tanstack/react-query';

import { conversationKey } from '@/shared/lib/conversation';
import type { ConversationRef } from '@/shared/lib/conversation';
import type { AppError } from '@/shared/api/errors';
import { unfoldedOf } from './loaded';
import { conversationFrom } from '../services/conversation-reducer';
import { fetchSubagentPage } from '../services/subagent.service';
import type { Conversation } from '../types/live-session';

/** What a subagent said, from the history, once its row is unfolded. */
export interface SubagentHistory {
  readonly conversation: Conversation | null;
  readonly isLoading: boolean;
  readonly error: AppError | null;
  retry(): void;
}

/**
 * The subagent a tool opened, read from the history — only when asked (`enabled`: the row is
 * unfolded) and only when the stream did not already bring it (plan 08, B-21). Through the same
 * reducer as everything else, so it is drawn as it was drawn live.
 */
export function useSubagentHistory(
  conversation: ConversationRef | null,
  toolUseId: string,
  enabled: boolean,
  folder?: string,
): SubagentHistory {
  const query = useQuery<Conversation, AppError>({
    queryKey: ['subagent', conversation === null ? null : conversationKey(conversation), toolUseId],
    queryFn:
      enabled && conversation !== null
        ? async () =>
            conversationFrom(
              (await fetchSubagentPage(conversation, toolUseId, folder)).events,
            )
        : skipToken,
  });

  const { data, ...loaded } = unfoldedOf(query);

  return { conversation: data, ...loaded };
}
