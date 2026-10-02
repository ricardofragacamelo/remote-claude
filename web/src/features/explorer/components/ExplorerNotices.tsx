import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { Explorer } from '../hooks/useExplorer';
import type { WatchState } from '../store/explorer.store';

export interface ExplorerNoticesProps {
  readonly explorer: Explorer;
}

/** What the warning says, by why the folder is not followed — named in full for the i18n check. */
const NOT_FOLLOWED: Readonly<Record<string, string>> = {
  WATCH_UNAVAILABLE: 'files.error.watchUnavailable',
  WATCH_LIMIT_REACHED: 'explorer.watch.limitReached',
};

/** The machine stopped following the folder: out of watchers. */
const SYSTEM_LIMIT = 'explorer.watch.systemLimit';

/** The warning of a folder not followed — `null` while it is, or while the tab is in error. */
export function notFollowedKey(watch: WatchState): string | null {
  if (watch.state === 'unavailable') {
    return NOT_FOLLOWED[watch.code] ?? 'explorer.watch.refused';
  }

  return watch.state === 'stopped' && watch.reason === 'systemLimit' ? SYSTEM_LIMIT : null;
}

/**
 * What the Explorer says besides the tree: a folder this machine cannot follow — the tree does not
 * update itself, and a button reads it again by hand (S-194) — and, for a screen reader, what each
 * operation did, in a polite live region (S-277).
 */
export function ExplorerNotices({ explorer }: ExplorerNoticesProps): React.JSX.Element {
  const { t } = useTranslation();
  const warning = notFollowedKey(explorer.state.watch);
  const said = explorer.state.announcement;

  return (
    <>
      {warning !== null && (
        <div
          role="status"
          className="flex shrink-0 flex-col items-start gap-1 border-b border-border px-3 py-2 text-ui-sm"
        >
          <p className="flex items-start gap-1">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t(warning)}
          </p>
          <p className="text-muted-foreground">{t('explorer.watch.notFollowed')}</p>
          <Button variant="outline" size="default" onClick={explorer.refresh}>
            {t('explorer.watch.reload')}
          </Button>
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {said !== null && <span key={said.id}>{t(said.key, { ...said.params })}</span>}
      </p>
    </>
  );
}
