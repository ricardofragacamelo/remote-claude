import { Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { useChangeFile } from '../../hooks/useChangeFile';
import { nameOf } from '../../lib/diff-sides';
import { LoadedHunks } from './LoadedHunks';

export interface ChangeHunksProps {
  readonly sessionId: string;
  readonly path: string;

  /** A rejection is in flight — the buttons wait for it. */
  readonly busy: boolean;
  onReject(hunkId: string, revision: string): void;
}

/**
 * The hunks of one file of the changes, each with the way to reject it (plan 08, B-31).
 *
 * A hunk is rejected against the revision it was computed on: a file that changed since refuses it,
 * and this list reads the file again. A file somebody changed after the session offers no hunk —
 * only rejecting it whole, which keeps it as it is (S-124).
 */
export function ChangeHunks({
  sessionId,
  path,
  busy,
  onReject,
}: ChangeHunksProps): React.JSX.Element {
  const { t } = useTranslation();
  const loaded = useChangeFile(sessionId, path);
  const file = loaded.data;

  return (
    <LoadedHunks
      loaded={loaded}
      loadingLabel={t('sessions.changes.hunksLoading')}
      label={t('sessions.diff.label', { name: nameOf(path) })}
      empty={<p className="text-ui-xs text-muted-foreground">{t('sessions.changes.noHunks')}</p>}
      actions={
        file === null || file.modifiedOutside
          ? undefined
          : (hunk) => (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  onReject(hunk.id, file.revision);
                }}
              >
                <Undo2 className="size-3.5" aria-hidden />
                {t('sessions.changes.rejectHunk')}
              </Button>
            )
      }
    />
  );
}
