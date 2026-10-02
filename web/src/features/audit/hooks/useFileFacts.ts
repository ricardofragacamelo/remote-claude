import { usePagedQuery } from '@/shared/hooks/usePagedQuery';
import type { PagedQuery } from '@/shared/hooks/usePagedQuery';
import { fetchFileFacts } from '../services/file-facts.service';
import type { FileFact, FileFactPage } from '../types/file-facts';

/** The keys of the facts in the cache. */
export const fileFactKeys = { all: ['audit', 'fileFacts'] as const };

/** The facts about files, a page at a time, and the four states of the first page. */
export interface FileFacts extends Omit<PagedQuery<FileFactPage>, 'pages'> {
  readonly facts: readonly FileFact[];
}

/**
 * What the person did to their files — newest first, paged by cursor, held in the cache. Its failure
 * is its own: the rest of the trail carries on (S-197).
 */
export function useFileFacts(): FileFacts {
  const { pages, ...paging } = usePagedQuery({
    queryKey: fileFactKeys.all,
    fetchPage: fetchFileFacts,
    nextCursor: (page) => page.nextCursor,
    refetchOnWindowFocus: true,
  });

  return { ...paging, facts: pages?.flatMap((page) => page.facts) ?? [] };
}
