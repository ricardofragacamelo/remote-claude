import { useMemo } from 'react';

import type { AppError } from '@/shared/api/errors';
import { usePagedQuery } from '@/shared/hooks/usePagedQuery';
import { fetchHistoryPage } from '../services/history.service';
import { conversationFrom, SILENT } from '../services/live-session.service';
import type { ConversationSummary } from '../types/history';
import type { Conversation } from '../types/live-session';

/** The keys of the history, in one place, so invalidating one is not an exercise in guessing. */
export const historyKeys = {
  all: ['history'] as const,
  pages: (conversationId: string) => [...historyKeys.all, 'pages', conversationId] as const,
};

/** What the history screen gets: the conversation so far read, and the way to what came before. */
export interface ConversationHistory {
  readonly isLoading: boolean;
  readonly error: AppError | null;

  /** What the conversation is: where it ran, where it came from. `null` until the first page. */
  readonly summary: ConversationSummary | null;

  readonly conversation: Conversation;

  /** Whether anything was said before the oldest message on screen. */
  readonly hasEarlier: boolean;
  readonly isLoadingEarlier: boolean;
  readonly earlierError: AppError | null;

  loadEarlier(): void;
  reload(): void;
}

/**
 * A conversation of the history, a page at a time, from the latest message backwards.
 *
 * Opening the same conversation again inside the stale window reads the cache and asks the network
 * nothing (S-16). The backend caches the expensive read as well, and for a different reason — the
 * SDK reparses the whole file on every call. Coming back to the tab is not a reason to read it
 * again: this is a detail, not a list.
 *
 * The pages arrive newest first and each is oldest first inside, so the conversation is the pages
 * reversed, flattened, and folded by the one reducer the live stream uses (B-03).
 */
export function useConversationHistory(conversationId: string): ConversationHistory {
  const history = usePagedQuery({
    queryKey: historyKeys.pages(conversationId),
    fetchPage: (cursor) => fetchHistoryPage(conversationId, cursor),
    nextCursor: (page) => page.nextCursor,
    refetchOnWindowFocus: false,
  });

  const { pages } = history;

  const conversation = useMemo(
    () =>
      pages === undefined
        ? SILENT
        : conversationFrom([...pages].reverse().flatMap((page) => page.events)),
    [pages],
  );

  return {
    isLoading: history.isLoading,
    error: history.error,
    summary: pages?.[0]?.conversation ?? null,
    conversation,
    hasEarlier: history.hasMore,
    isLoadingEarlier: history.isLoadingMore,
    earlierError: history.moreError,
    loadEarlier: history.loadMore,
    reload: history.reload,
  };
}
