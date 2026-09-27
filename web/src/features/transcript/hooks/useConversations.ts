import type { ConversationSummary } from '@/features/session';
import type { PagedQuery } from '@/shared/hooks/usePagedQuery';
import { usePagedQuery } from '@/shared/hooks/usePagedQuery';
import { fetchConversations } from '../services/transcript.service';
import type { ConversationListPage } from '../types/transcript';

/** The keys of the listing, in one place. */
export const conversationKeys = {
  all: ['conversations'] as const,
  list: (workspacePath: string) => [...conversationKeys.all, 'list', workspacePath] as const,
};

/** What the list gets: the rows so far read, the four states, and the way to the next page. */
export interface Conversations extends Omit<PagedQuery<ConversationListPage>, 'pages'> {
  readonly conversations: readonly ConversationSummary[];
}

/**
 * The conversations of one workspace, a page at a time.
 *
 * It is a list, so coming back to the tab asks again — a conversation written meanwhile in the
 * editor is exactly what somebody looking at this list wants to see.
 */
export function useConversations(workspacePath: string): Conversations {
  const { pages, ...paging } = usePagedQuery({
    queryKey: conversationKeys.list(workspacePath),
    fetchPage: (cursor) => fetchConversations(workspacePath, cursor),
    nextCursor: (page) => page.nextCursor,
    refetchOnWindowFocus: true,
  });

  return { ...paging, conversations: pages?.flatMap((page) => page.conversations) ?? [] };
}
