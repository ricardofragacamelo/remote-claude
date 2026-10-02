import { History, ListTree } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import type { Restorer } from '../hooks/useRestore';
import { useRecentlyDeleted } from '../hooks/useTimeline';
import { useEntryWords } from '../hooks/useEntryWords';
import { timelineStore } from '../store/timeline.store';
import type { HistoryEntry } from '../types/history';
import { PagedList } from './PagedList';

export interface DeletedFilesProps {
  readonly folder: string;
  readonly restorer: Restorer;
}

/**
 * "Recently deleted": what was deleted from the folder and is not there any more — each restorable
 * where it was, and with its versions within reach although the file no longer exists (S-349).
 */
export function DeletedFiles({ folder, restorer }: DeletedFilesProps): React.JSX.Element {
  const { t } = useTranslation();
  const deleted = useRecentlyDeleted(folder);

  return (
    <div className="flex flex-col gap-1 p-2">
      <PagedList
        list={deleted}
        label={t('fileHistory.deleted.listLabel')}
        loadingLabel={t('fileHistory.deleted.loading')}
        emptyTitle={t('fileHistory.deleted.emptyTitle')}
        emptyDescription={t('fileHistory.deleted.emptyDescription')}
      >
        {deleted.entries.map((entry) => (
          <DeletedRow key={entry.id} folder={folder} entry={entry} restorer={restorer} />
        ))}
      </PagedList>
    </div>
  );
}

function DeletedRow({
  folder,
  entry,
  restorer,
}: DeletedFilesProps & { readonly entry: HistoryEntry }): React.JSX.Element {
  const { t } = useTranslation();
  const { who, when } = useEntryWords(entry);

  return (
    <li className="flex items-center justify-between gap-2 border-b border-border px-2 py-1 text-ui-sm last:border-b-0">
      <span className="flex min-w-0 flex-col">
        <span className="font-code break-all">{entry.path}</span>
        <span className="text-muted-foreground">
          {t('fileHistory.deleted.byAt', { who, when })}
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        {entry.entryKind === 'file' && (
          <IconButton
            icon={ListTree}
            label={t('fileHistory.action.showVersions', { path: entry.path })}
            onClick={() => {
              timelineStore(folder).getState().showGone(entry.path);
            }}
          />
        )}
        {entry.kept === 'yes' && (
          <IconButton
            icon={History}
            label={t('fileHistory.action.restoreDeleted', { path: entry.path })}
            disabled={restorer.pending}
            onClick={() => {
              restorer.request(entry, true);
            }}
          />
        )}
      </span>
    </li>
  );
}
