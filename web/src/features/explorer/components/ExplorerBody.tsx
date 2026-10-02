import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { LoadStatus } from '@/shared/components/LoadStatus';
import { Button } from '@/shared/components/ui/button';
import type { ExplorerAction } from '../hooks/explorer-actions';
import type { Explorer } from '../hooks/useExplorer';
import { ExplorerTree } from './ExplorerTree';

export interface ExplorerBodyProps {
  readonly explorer: Explorer;
  readonly actions: readonly ExplorerAction[];
}

/** The refusals of the folder itself that no retry mends: the way back is the start page (S-158). */
const FOLDER_GONE = new Set(['WORKSPACE_NOT_ALLOWED', 'WORKSPACE_NOT_FOUND']);

/** Why the folder of the tab stopped being followed, as the error of the tab (S-195). */
const STOPPED: Readonly<Record<string, string>> = {
  folderDeleted: 'explorer.watch.folderDeleted',
  allowlistChanged: 'explorer.watch.allowlistChanged',
};

/** The error the tab is in when the server said its folder went — `null` when it did not. */
function stoppedKey(explorer: Explorer): string | null {
  const watch = explorer.state.watch;
  return watch.state === 'stopped' ? (STOPPED[watch.reason] ?? null) : null;
}

/**
 * The four states of the Explorer (web/03): the shape of the tree while it loads, the folder's
 * refusal translated with its trace and a way to try again — and, when the folder itself is no
 * longer allowed or gone, the way back to the start (S-158) —, an empty folder that teaches the next
 * step (S-200), and the tree.
 */
export function ExplorerBody({ explorer, actions }: ExplorerBodyProps): React.JSX.Element {
  const { t } = useTranslation();
  const root = explorer.tree.root;
  const stopped = stoppedKey(explorer);

  if (stopped !== null) {
    return <FolderGone messageKey={stopped} />;
  }

  if (root.status !== 'ready') {
    return (
      <div className="flex flex-col gap-2 p-3">
        <LoadStatus
          isLoading={root.status === 'loading'}
          loadingLabel={t('explorer.tree.loadingFolder')}
          error={root.status === 'error' ? root.error : null}
          onRetry={() => {
            explorer.tree.retry('');
          }}
          rows={6}
        />
        {root.status === 'error' && FOLDER_GONE.has(root.error.code) && <BackToStart />}
      </div>
    );
  }

  if (explorer.tree.rows.length === 0) {
    return <NothingHere explorer={explorer} />;
  }

  return <ExplorerTree explorer={explorer} actions={actions} />;
}

/** A folder empty, or a filter that matches nothing — each with what to do next. */
function NothingHere({ explorer }: { readonly explorer: Explorer }): React.JSX.Element {
  const { t } = useTranslation();

  if (explorer.state.filter.trim() !== '') {
    return (
      <p role="status" className="p-3 text-ui text-muted-foreground">
        {t('explorer.filter.noMatch', { filter: explorer.state.filter })}
      </p>
    );
  }

  return (
    <div className="p-3">
      <EmptyState
        title={t('explorer.empty.title')}
        description={t('explorer.empty.description')}
        action={
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                explorer.newEntry('file');
              }}
            >
              {t('explorer.action.newFile')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                explorer.chooseTemplate(true);
              }}
            >
              {t('explorer.action.newFromTemplate')}
            </Button>
          </div>
        }
      />
    </div>
  );
}

/** The folder of the tab went — deleted, or out of the allowlist: this tab's error, no other's. */
function FolderGone({ messageKey }: { readonly messageKey: string }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div role="alert" className="flex flex-col items-start gap-2 p-3 text-ui">
      <p className="text-destructive">{t(messageKey)}</p>
      <BackToStart />
    </div>
  );
}

/**
 * The way back to the start page, where another folder is opened — a link and not a navigation of
 * the router's: a feature never learns the router exists (web/01).
 */
function BackToStart(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <a
      href="/"
      className="inline-flex min-h-touch items-center text-ui underline underline-offset-4 md:min-h-0"
    >
      {t('explorer.error.backToStart')}
    </a>
  );
}
