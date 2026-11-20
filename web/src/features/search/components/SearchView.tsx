import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { fileIsDirty } from '@/features/editor';
import { IconButton } from '@/shared/components/IconButton';
import { LearnMore } from '@/shared/components/LearnMore';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useReplaceView } from '../hooks/useReplaceView';
import type { ReplaceView } from '../hooks/useReplaceView';
import { useSearchView } from '../hooks/useSearchView';
import type { SearchView as SearchViewState } from '../hooks/useSearchView';
import { ReplaceConfirm } from './ReplaceConfirm';
import type { ReplaceTarget } from './ReplaceConfirm';
import { SearchResultsTree } from './SearchResultsTree';
import { SearchHelp } from './SearchHelp';
import { SearchToolbar } from './SearchToolbar';

export interface SearchViewProps {
  /** The real path of the folder of the tab. */
  readonly folder: string;
}

function truncatedKeyOf(reason: 'limit' | 'timeout'): string {
  return reason === 'limit' ? 'search.view.truncatedLimit' : 'search.view.truncatedTimeout';
}

/** The four states the body of the view is in, before any result ever arrived. */
function SearchLoading(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 p-4">
      <Skeleton className="h-5 w-2/3" aria-label={t('search.view.loading')} />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-5 w-3/4" />
    </div>
  );
}

function SearchEmpty({ started }: { readonly started: boolean }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <p className="p-4 text-center text-ui-sm text-muted-foreground">
      {t(started ? 'search.view.noMatch' : 'search.view.empty')}
    </p>
  );
}

function SearchFailed({
  message,
  retry,
}: {
  readonly message: string;
  readonly retry: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-2 p-4 text-center">
      <p role="alert" className="text-ui-sm text-destructive">
        {message}
      </p>
      <Button variant="outline" size="default" onClick={retry}>
        {t('common.action.retry')}
      </Button>
    </div>
  );
}

/** The results tree, or one of the three states before anything ever arrived. */
function SearchBody({
  view,
  replace,
  rows,
  isLoading,
  error,
  onReplaceFile,
}: {
  readonly view: SearchViewState;
  readonly replace: ReplaceView;
  readonly rows: readonly unknown[];
  readonly isLoading: boolean;
  readonly error: SearchViewState['error'];
  onReplaceFile(path: string): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const patternInvalid = error?.code === 'SEARCH_PATTERN_INVALID';
  const rateLimited = error?.code === 'RATE_LIMITED';

  if (rows.length > 0) {
    return <SearchResultsTree view={view} replace={replace} onReplaceFile={onReplaceFile} />;
  }
  if (isLoading) {
    return <SearchLoading />;
  }
  if (error !== null && !patternInvalid) {
    return (
      <SearchFailed
        message={
          rateLimited
            ? t('search.view.rateLimited', {
                seconds: Number(error.params['retryAfterSeconds'] ?? 0),
              })
            : t(error.messageKey, error.params)
        }
        retry={replace.replaceOpen ? replace.redoPreview : view.searchAgain}
      />
    );
  }
  return <SearchEmpty started={view.query !== ''} />;
}

/**
 * What applying the replace said it did, or a real refusal of the apply itself (too many files,
 * or a write that failed partway, `params.applied` included) — until dismissed, or the next
 * preview replaces it.
 */
function ReplaceReport({
  report,
  error,
  onRedoPreview,
  onDismiss,
}: {
  readonly report: {
    readonly applied: readonly string[];
    readonly changed: readonly string[];
  } | null;
  readonly error: {
    readonly messageKey: string;
    readonly params: Readonly<Record<string, unknown>>;
  } | null;
  onRedoPreview(): void;
  onDismiss(): void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 border-t border-border px-3 py-1 text-ui-sm"
      role="status"
    >
      {error !== null ? (
        <>
          <p role="alert">{t(error.messageKey, error.params)}</p>
          {Array.isArray(error.params['applied']) && error.params['applied'].length > 0 && (
            <p>
              {t('search.view.replaceReportAppliedBeforeFailure', {
                count: error.params['applied'].length,
              })}
            </p>
          )}
        </>
      ) : (
        report !== null && (
          <>
            <p>{t('search.view.replaceReportApplied', { count: report.applied.length })}</p>
            {report.changed.length > 0 && (
              <>
                <p>{t('search.view.replaceReportPreserved', { count: report.changed.length })}</p>
                <button
                  type="button"
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  onClick={onRedoPreview}
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                  {t('search.view.actionRedoPreview')}
                </button>
              </>
            )}
          </>
        )
      )}
      <IconButton
        icon={X}
        label={t('search.view.replaceReportDismiss')}
        className="ml-auto"
        onClick={onDismiss}
      />
    </div>
  );
}

/**
 * The Search view of a folder tab (plan 11, B-15, B-16): the toolbar of the query and its flags,
 * the replace row, the results tree, and the four states of getting there. Everything is the
 * tab's own — another folder tab has a Search of its own, query and results both (S-121).
 */
export function SearchView({ folder }: SearchViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const view = useSearchView(folder);
  const replace = useReplaceView(folder);
  const replacing = replace.replaceOpen;
  const [pending, setPending] = useState<ReplaceTarget | null>(null);

  const rows = replacing ? replace.rows : view.rows;
  const isLoading = replacing ? replace.isPreviewing : view.isSearching;
  const error = replacing ? replace.error : view.error;
  const truncated = replacing ? replace.truncated : view.truncated;

  /** A clean file replaces at once — the dialog asks only for "all", or a file open dirty (S-126). */
  const requestReplaceFile = (path: string): void => {
    if (fileIsDirty(folder, path)) {
      setPending({ kind: 'file', path });
    } else {
      replace.replaceFile(path).catch(() => undefined);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SearchToolbar
        view={view}
        replace={replace}
        onReplaceAll={() => {
          setPending({ kind: 'all' });
        }}
      />
      <SearchBody
        view={view}
        replace={replace}
        rows={rows}
        isLoading={isLoading}
        error={error}
        onReplaceFile={requestReplaceFile}
      />
      {truncated !== null && (
        <p className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-2 py-1 text-ui-sm text-muted-foreground">
          {t(truncatedKeyOf(truncated.reason))}
          <LearnMore
            topic={t('search.help.missingHeading')}
            onOpen={() => {
              view.setHelpOpen(true);
            }}
          />
        </p>
      )}
      {(replace.report !== undefined || replace.applyError !== null) && (
        <ReplaceReport
          report={replace.report ?? null}
          error={replace.applyError}
          onRedoPreview={replace.redoPreview}
          onDismiss={replace.dismissReport}
        />
      )}
      <ReplaceConfirm
        folder={folder}
        replace={replace}
        target={pending}
        onClose={() => {
          setPending(null);
        }}
      />
      <SearchHelp view={view} />
    </div>
  );
}
