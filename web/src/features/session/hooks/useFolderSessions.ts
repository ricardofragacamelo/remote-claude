import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import type { PagedQuery } from '@/shared/hooks/usePagedQuery';
import { usePagedQuery } from '@/shared/hooks/usePagedQuery';
import { fetchFolderConversations, fetchLiveSessions } from '../services/sessions-view.service';
import type { ConversationSummary } from '../types/history';
import type { FolderConversationPage, LiveSessionSummary } from '../types/sessions-view';

/**
 * How often the lists ask again while the view is on screen (plan 08, D-10).
 *
 * The view is mounted only while it is the one the side bar shows and its tab is the active one, so
 * the polling stops by itself with the view hidden or the tab in the background — and the first
 * read after coming back is a fresh one, because nothing here is ever fresh for long.
 */
export const SESSIONS_POLL_MS = 10_000;

/** The keys of the two lists, in one place. */
export const folderSessionKeys = {
  all: ['folder-sessions'] as const,
  live: (folder: string) => [...folderSessionKeys.all, 'live', folder] as const,
  history: (folder: string, includeSubfolders: boolean) =>
    [...folderSessionKeys.all, 'history', folder, includeSubfolders] as const,
};

/** What the view reads: the live sessions, the conversations, and the states of each. */
export interface FolderSessions {
  readonly live: {
    readonly sessions: readonly LiveSessionSummary[];
    readonly isLoading: boolean;
    readonly error: AppError | null;
    reload(): void;
  };
  readonly history: Omit<PagedQuery<FolderConversationPage>, 'pages'> & {
    readonly conversations: readonly ConversationSummary[];
  };
}

/**
 * The sessions of a folder tab: what runs here, and the history with what each conversation is
 * doing (plan 08, B-09, B-11).
 *
 * Both lists poll while the view is on screen, and both are asked again at once when this client
 * sees a session begin or end — a response that arrives late never overwrites a newer one, which is
 * the query cache's own rule (S-50).
 */
export function useFolderSessions(folder: string, includeSubfolders: boolean): FolderSessions {
  const client = useQueryClient();

  const live = useQuery<readonly LiveSessionSummary[], AppError>({
    queryKey: folderSessionKeys.live(folder),
    queryFn: () => fetchLiveSessions(folder),
    staleTime: 0,
    refetchInterval: SESSIONS_POLL_MS,
  });

  const { pages, ...paging } = usePagedQuery({
    queryKey: folderSessionKeys.history(folder, includeSubfolders),
    fetchPage: (cursor) => fetchFolderConversations(folder, cursor, includeSubfolders),
    nextCursor: (page) => page.nextCursor,
    refetchOnWindowFocus: true,
    refetchIntervalMs: SESSIONS_POLL_MS,
    staleTimeMs: 0,
  });

  useEffect(
    () =>
      wsClient.onSessionLifecycle(() => {
        void client.invalidateQueries({ queryKey: folderSessionKeys.all });
      }),
    [client],
  );

  return {
    live: {
      sessions: live.data ?? [],
      isLoading: live.isPending,
      error: live.data === undefined ? live.error : null,
      reload: () => {
        void live.refetch();
      },
    },
    history: { ...paging, conversations: pages?.flatMap((page) => page.conversations) ?? [] },
  };
}
