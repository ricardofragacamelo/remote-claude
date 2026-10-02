import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand';

import { useActiveFile } from '@/features/editor';
import { usePagedQuery } from '@/shared/hooks/usePagedQuery';
import type { PagedQuery } from '@/shared/hooks/usePagedQuery';
import { fetchDeleted, fetchHistoryLimits, fetchVersions } from '../services/history.service';
import { timelineStore } from '../store/timeline.store';
import type { TimelineState } from '../store/timeline.store';
import type { HistoryEntry, HistoryPage, HistoryReason } from '../types/history';
import { historyKeys } from './history-keys';

/** The Timeline of a folder tab, as React state — or the part `select` picks of it. */
export function useTimelineState<T>(folder: string, select: (state: TimelineState) => T): T {
  return useStore(timelineStore(folder), select);
}

/** The Timeline follows the editor's active file — and keeps the last one while a diff is on screen. */
export function useFollowActiveFile(folder: string): void {
  const active = useActiveFile(folder);

  useEffect(() => {
    timelineStore(folder).getState().follow(active);
  }, [folder, active]);
}

/** A paged list of versions, flattened for the screen. */
export interface VersionList extends Omit<PagedQuery<HistoryPage>, 'pages'> {
  readonly entries: readonly HistoryEntry[];
}

function flattened(query: PagedQuery<HistoryPage>): VersionList {
  const { pages, ...paging } = query;
  return { ...paging, entries: pages?.flatMap((page) => page.entries) ?? [] };
}

/** The versions of one path, newest first, a page at a time — of a reason only, when filtered. */
export function useVersions(
  folder: string,
  path: string,
  reason: HistoryReason | null,
): VersionList {
  return flattened(
    usePagedQuery({
      queryKey: historyKeys.versions(folder, path, reason),
      fetchPage: (cursor) => fetchVersions(folder, path, reason, cursor),
      nextCursor: (page) => page.nextCursor,
      refetchOnWindowFocus: true,
    }),
  );
}

/** The files of the folder deleted recently — the last delete of each path that no longer exists. */
export function useRecentlyDeleted(folder: string): VersionList {
  return flattened(
    usePagedQuery({
      queryKey: historyKeys.deleted(folder),
      fetchPage: (cursor) => fetchDeleted(folder, cursor),
      nextCursor: (page) => page.nextCursor,
      refetchOnWindowFocus: true,
    }),
  );
}

/** The largest file the history keeps, in bytes — `null` until the server said it. */
export function useHistoryCeiling(): number | null {
  const query = useQuery({
    queryKey: historyKeys.limits,
    queryFn: fetchHistoryLimits,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return query.data?.historyMaxFileBytes ?? null;
}
