import { FileDiff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { useDiffTabs } from '../../hooks/useDiffTabs';
import { useToolDiff } from '../../hooks/useToolDiff';
import { nameOf } from '../../lib/diff-sides';
import type { ChangeSide } from '../../types/changes';
import type { ToolExecution } from '../../types/live-session';
import { LoadedHunks } from '../changes/LoadedHunks';

/** Past this many lines the diff in the chat folds — the conversation stays readable (B-27). */
export const INLINE_DIFF_LINES = 12;

/** Why a side of the diff is not known — named in full so the i18n check sees each key. */
const UNKNOWN_SIDE: Readonly<Record<string, string>> = {
  laterTouch: 'sessions.diffReason.laterTouch',
  noSnapshot: 'sessions.diffReason.noSnapshot',
  tooLarge: 'sessions.diffReason.tooLarge',
  unreadable: 'sessions.diffReason.unreadable',
  laterWrite: 'sessions.diffReason.laterWrite',
  changedSince: 'sessions.diffReason.changedSince',
};

export interface ToolDiffViewProps {
  readonly tool: ToolExecution;
  readonly sessionId: string;
  readonly folder: string;
}

/** What is said of a side that is not known, or `null` when it is. */
function noteOf(side: ChangeSide): string | null {
  if (side.state === 'content' || side.state === 'absent') {
    return null;
  }

  return UNKNOWN_SIDE[side.reason ?? ''] ?? 'sessions.diffReason.unknown';
}

/**
 * What an `Edit`, `MultiEdit` or `Write` changed, **in the chat** (plan 08, B-27): the hunks, folded
 * past {@link INLINE_DIFF_LINES} lines, with the way to the diff tab of the editor in the same folder
 * tab. A side the store cannot give is **said**, never invented (D-03); a diff that failed to load
 * says why here, and the conversation stays (S-121).
 */
export function ToolDiffView({ tool, sessionId, folder }: ToolDiffViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const loaded = useToolDiff(sessionId, tool.toolUseId);
  const tabs = useDiffTabs(folder, sessionId);

  return (
    <div className="ml-5">
      <LoadedHunks
        loaded={loaded}
        loadingLabel={t('sessions.diff.loading')}
        label={t('sessions.diff.label', { name: nameOf(loaded.data?.path ?? '') })}
        foldAfter={INLINE_DIFF_LINES}
      >
        {(diff) => (
          <>
            {[noteOf(diff.before), noteOf(diff.after)].map(
              (note, index) =>
                note !== null && (
                  <p key={`${note}:${String(index)}`} className="text-ui-xs text-muted-foreground">
                    {t(note)}
                  </p>
                ),
            )}
            {diff.scope === 'file' && (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => {
                  tabs.openToolDiff(tool.toolUseId, diff.path);
                }}
              >
                <FileDiff className="size-3.5" aria-hidden />
                {t('sessions.diff.open')}
              </Button>
            )}
          </>
        )}
      </LoadedHunks>
    </div>
  );
}
