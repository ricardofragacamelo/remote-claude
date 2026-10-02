import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ListStatus } from '@/shared/components/ListStatus';
import { LoadMore } from '@/shared/components/LoadMore';
import type { VersionList } from '../hooks/useTimeline';

export interface PagedListProps {
  readonly list: VersionList;

  /** Translated: what the list is, and what it says while loading and when empty. */
  readonly label: string;
  readonly loadingLabel: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;

  /** The `<li>` elements, rendered only when there is something to show. */
  readonly children: ReactNode;
}

/** A list of the local history in its four states, and the way to its next page. */
export function PagedList({
  list,
  label,
  loadingLabel,
  emptyTitle,
  emptyDescription,
  children,
}: PagedListProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <ListStatus
        isLoading={list.isLoading}
        loadingLabel={loadingLabel}
        error={list.error}
        onRetry={list.reload}
        isEmpty={list.entries.length === 0}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        rows={3}
      />
      {list.entries.length > 0 && <ul aria-label={label}>{children}</ul>}
      <LoadMore
        hasMore={list.hasMore}
        isLoading={list.isLoadingMore}
        error={list.moreError}
        onLoadMore={list.loadMore}
        label={t('fileHistory.timeline.more')}
        loadingLabel={t('fileHistory.timeline.loadingMore')}
      />
    </>
  );
}
