import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import { LearnMore } from '@/shared/components/LearnMore';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useFolder } from '../hooks/useFolder';
import type { FolderOpening } from '../hooks/useFolder';
import type { ResolvedFolder } from '../types/workspace';
import { OpenFolderDialog } from './OpenFolderDialog';

/** A refusal, as the hook hands it over — the component never learns the transport's types. */
type Failure = NonNullable<FolderOpening['error']>;

export interface FolderGateProps {
  /** The folder the URL names, exactly as it names it. */
  readonly folder: string;

  /** Opens another folder in the workbench. */
  onOpen(path: string): void;

  /**
   * The folder turned out to be somewhere else — a symlink, resolved. The address should now name
   * the real one. Has to be stable across renders.
   */
  onMoved(real: string): void;

  /** Back to the welcome screen. */
  onHome(): void;

  /** What the workbench shows once the folder is known — with the folder as the server resolved it. */
  children(folder: ResolvedFolder): ReactNode;
}

/**
 * Nothing of the workbench shows before the folder of the URL is resolved.
 *
 * Its name and path are the tab's and the status bar's to show; here there is only what follows,
 * and — when the server did not keep the folder among the tabs — why, above it.
 *
 * A folder the server refuses — outside the allowlist, missing, a file — is an error state with the
 * way back: the welcome screen, or another folder right here. Once resolved, what follows is given
 * the **real** path, never the one the link spelled, and never a root picked by default
 * (plan 06, B-16).
 */
export function FolderGate({
  folder,
  onOpen,
  onMoved,
  onHome,
  children,
}: FolderGateProps): React.JSX.Element {
  const { t } = useTranslation();
  const opening = useFolder(folder, onMoved);

  if (opening.error !== null) {
    return (
      <Refused error={opening.error} onRetry={opening.reload} onOpen={onOpen} onHome={onHome} />
    );
  }

  if (opening.folder === undefined) {
    return (
      <div className="p-4">
        <Skeleton className="h-24 w-full" aria-label={t('workspace.folder.loading')} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {opening.recordError !== null && <NotKept error={opening.recordError} />}

      {children(opening.folder)}
    </div>
  );
}

interface RefusedProps {
  readonly error: Failure;
  onRetry(): void;
  onOpen(path: string): void;
  onHome(): void;
}

/** A folder that cannot be opened — why, and the two ways on from here. */
function Refused({ error, onRetry, onOpen, onHome }: RefusedProps): React.JSX.Element {
  const { t } = useTranslation();
  const [browsing, setBrowsing] = useState(false);

  return (
    <section className="flex flex-col gap-4 p-4 md:p-6" aria-labelledby="workbench-folder-refused">
      <header className="flex flex-col gap-1">
        <h2 id="workbench-folder-refused" className="text-lg font-semibold">
          {t('workspace.folder.refusedTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('workspace.folder.refusedDescription')}</p>
      </header>
      <ErrorState error={error} onRetry={onRetry} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onHome}>
          {t('workspace.folder.backToWelcome')}
        </Button>
        <Button
          onClick={() => {
            setBrowsing(true);
          }}
        >
          {t('workspace.folder.openOther')}
        </Button>
      </div>
      <OpenFolderDialog
        open={browsing}
        startAt={null}
        onOpenChange={setBrowsing}
        onOpen={(path) => {
          setBrowsing(false);
          onOpen(path);
        }}
      />
    </section>
  );
}

/** The folder is open, but the server did not keep it among the tabs — said beside it. */
function NotKept({ error }: { readonly error: Failure }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="flex shrink-0 flex-col gap-1 border-b border-border px-3 py-2 text-ui"
    >
      <p className="font-medium">{t('workspace.folder.notKept')}</p>
      <p className="text-muted-foreground">{t(error.messageKey, error.params)}</p>
      {error.code === 'OPEN_FOLDERS_LIMIT_REACHED' && (
        <LearnMore section="states" topic={t('help.topic.tabLimit')} />
      )}
    </div>
  );
}
