import { useTranslation } from 'react-i18next';

import { LoadedList } from '@/shared/components/LoadedList';
import type { ListKeys } from '@/shared/components/LoadedList';
import { useRecentFolders } from '../hooks/useRecentFolders';
import { RecentFolderRow } from './RecentFolderRow';

/** Named as literals, so the orphan check can see that the catalogue entries are in use. */
const KEYS: ListKeys = {
  title: 'workspace.recent.title',
  description: 'workspace.recent.description',
  loading: 'workspace.recent.loading',
  emptyTitle: 'workspace.recent.emptyTitle',
  emptyDescription: 'workspace.recent.emptyDescription',
};

export interface RecentFolderListProps {
  /** Opens a folder. Absent, the list only manages them — pin and remove, in Settings. */
  onOpen?(path: string): void;
}

/**
 * The folders this user opened, pinned first.
 *
 * The empty state teaches the next step instead of saying "nothing here". Past a screen of rows
 * the list gets a search, and a search that finds nothing says so — never that there are no recent
 * folders, which would not be true.
 */
export function RecentFolderList({ onOpen }: RecentFolderListProps): React.JSX.Element {
  const { t } = useTranslation();
  const recent = useRecentFolders();

  return (
    <LoadedList
      keys={KEYS}
      isLoading={recent.isLoading}
      error={recent.error}
      isEmpty={recent.folders.length === 0}
      onRetry={recent.reload}
      before={
        recent.searchable && (
          <div className="flex flex-col gap-2">
            <input
              type="search"
              value={recent.search}
              aria-label={t('workspace.recent.search')}
              placeholder={t('workspace.recent.search')}
              className="h-10 rounded-lg border border-border bg-transparent px-3 text-sm"
              onChange={(event) => {
                recent.setSearch(event.target.value);
              }}
            />
            {recent.visible.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('workspace.recent.noMatch', { search: recent.search })}
              </p>
            )}
          </div>
        )
      }
    >
      {recent.visible.map((folder) => (
        <RecentFolderRow
          key={folder.path}
          folder={folder}
          busy={recent.isBusy(folder.path)}
          failure={recent.failureOf(folder.path)}
          {...(onOpen === undefined ? {} : { onOpen })}
          onPin={recent.pin}
          onForget={recent.forget}
        />
      ))}
    </LoadedList>
  );
}
