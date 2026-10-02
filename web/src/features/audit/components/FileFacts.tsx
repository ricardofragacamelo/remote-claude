import { useTranslation } from 'react-i18next';

import { LoadedList } from '@/shared/components/LoadedList';
import type { ListKeys } from '@/shared/components/LoadedList';
import { LoadMore } from '@/shared/components/LoadMore';
import { useFileFacts } from '../hooks/useFileFacts';
import type { FileAct, FileFact } from '../types/file-facts';

/** Named as literals, so the orphan check can see that the catalogue entries are in use. */
const KEYS: ListKeys = {
  title: 'audit.files.title',
  description: 'audit.files.description',
  loading: 'audit.files.loading',
  emptyTitle: 'audit.files.emptyTitle',
  emptyDescription: 'audit.files.emptyDescription',
};

/** What each act is called — named in full for the i18n check. */
const ACTS: Readonly<Record<FileAct, string>> = {
  created: 'audit.fileAct.created',
  written: 'audit.fileAct.written',
  moved: 'audit.fileAct.moved',
  copied: 'audit.fileAct.copied',
  deleted: 'audit.fileAct.deleted',
  failed: 'audit.fileAct.failed',
  downloaded: 'audit.fileAct.downloaded',
  restored: 'audit.fileAct.restored',
};

/**
 * "Files" — what the person did to the files of their open folders, from the web: the act, the path,
 * who and when. Never what a file holds: the trail does not keep it (S-196). A minimal section until
 * plan 14 joins it to one timeline (07 · D-13); its failure is said here, and the trail above carries
 * on (S-197).
 */
export function FileFacts(): React.JSX.Element {
  const { t } = useTranslation();
  const { facts, isLoading, error, hasMore, isLoadingMore, moreError, loadMore, reload } =
    useFileFacts();

  return (
    <div className="flex flex-col gap-4">
      <LoadedList
        keys={KEYS}
        isLoading={isLoading}
        error={error}
        isEmpty={facts.length === 0}
        onRetry={reload}
      >
        {facts.map((fact) => (
          <FileFactRow key={fact.id} fact={fact} />
        ))}
      </LoadedList>
      <LoadMore
        hasMore={hasMore}
        isLoading={isLoadingMore}
        error={moreError}
        onLoadMore={loadMore}
        label={t('audit.files.loadMore')}
        loadingLabel={t('audit.files.loadingMore')}
      />
    </div>
  );
}

function FileFactRow({ fact }: { readonly fact: FileFact }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const when = new Date(fact.at).toLocaleString(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  const act = t(ACTS[fact.act]);

  return (
    <li
      className="flex flex-col gap-1 rounded-lg border border-border p-3"
      aria-label={t('audit.files.row', { act, path: fact.path, at: when })}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{act}</span>
        <time dateTime={fact.at} className="text-xs text-muted-foreground">
          {when}
        </time>
      </div>
      <span className="font-code text-ui-sm break-all">
        {fact.to === null ? fact.path : t('audit.files.fromTo', { from: fact.path, to: fact.to })}
      </span>
      <span className="text-xs text-muted-foreground">{t('audit.files.byYou')}</span>
    </li>
  );
}
