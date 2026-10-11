import { FileDiff } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { useDiffTabs } from '../../hooks/useDiffTabs';
import { useToolDiff } from '../../hooks/useToolDiff';
import { nameOf } from '../../lib/diff-sides';
import type { ChangeSide, ToolDiff, ToolDiffAfter } from '../../types/changes';
import { LoadedHunks } from '../changes/LoadedHunks';

/** Past this many lines the diff in the chat folds — the conversation stays readable (B-27). */
export const INLINE_DIFF_LINES = 12;

/** Past this many lines the preview on a card that asks folds (plan 08, B-29). */
const PENDING_DIFF_LINES = 20;

/** Why a side of the diff is not known — named in full so the i18n check sees each key. */
const UNKNOWN_SIDE: Readonly<Record<string, string>> = {
  laterTouch: 'sessions.diffReason.laterTouch',
  noSnapshot: 'sessions.diffReason.noSnapshot',
  tooLarge: 'sessions.diffReason.tooLarge',
  unreadable: 'sessions.diffReason.unreadable',
  laterWrite: 'sessions.diffReason.laterWrite',
  changedSince: 'sessions.diffReason.changedSince',
};

/** Why a pending replacement would not apply — named in full so the i18n check sees each key. */
const REFUSED_EDIT: Readonly<Record<string, string>> = {
  editMissing: 'sessions.diffReason.editMissing',
  editAmbiguous: 'sessions.diffReason.editAmbiguous',
};

export interface ToolDiffViewProps {
  readonly toolUseId: string;
  readonly sessionId: string;
  readonly folder: string;

  /**
   * The call waits for an answer (plan 28, B-17): the diff is a preview against the disk now, said
   * to be one, and read again when the window gets the focus back.
   */
  readonly pending?: boolean;
}

/** What is said of a side that is not known, or `null` when it is. */
function noteOf(side: ChangeSide | ToolDiffAfter, t: TFunction): string | null {
  if (side.state === 'content' || side.state === 'absent') {
    return null;
  }

  const refused = REFUSED_EDIT[side.reason ?? ''];

  if (refused !== undefined && 'edit' in side) {
    return t(refused, { edit: (side.edit ?? 0) + 1 });
  }

  return t(UNKNOWN_SIDE[side.reason ?? ''] ?? 'sessions.diffReason.unknown');
}

/**
 * What a call that edits or writes a file changed, **in the chat** (plan 08, B-27): the hunks, folded
 * past {@link INLINE_DIFF_LINES} lines, with the way to the diff tab of the editor in the same folder
 * tab. A side the store cannot give is **said**, never invented (D-03); a diff that failed to load
 * says why here, and the conversation stays (S-121).
 *
 * Pending, it is what the change **would** do, before it is approved (plan 08, B-29), as the server
 * computes it from the call (plan 28, B-17): when it was read, a replacement that would not apply,
 * and a write that would change nothing — never a way to the editor, which shows what was done.
 */
export function ToolDiffView({
  toolUseId,
  sessionId,
  folder,
  pending = false,
}: ToolDiffViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const loaded = useToolDiff(sessionId, toolUseId, pending);
  const tabs = useDiffTabs(folder, sessionId);
  const framing = pending ? pendingFraming(loaded.data, t) : ranFraming(loaded.data, t);

  return (
    <div className={pending ? 'flex flex-col gap-1' : 'ml-5'}>
      {pending && loaded.data !== null && <PendingNote readAt={loaded.readAt} />}
      <LoadedHunks loaded={loaded} loadingLabel={t('sessions.diff.loading')} {...framing}>
        {(diff) => (
          <>
            <SideNotes diff={diff} />
            {diff.scope === 'file' && !diff.pending && (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => {
                  tabs.openToolDiff(toolUseId, diff.path);
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

/** How the hunks are named, folded and said to be none. */
interface Framing {
  readonly label: string;
  readonly foldAfter: number;
  readonly empty: ReactNode;
}

/** The diff of what a call did: named by its file, and silent with no hunk. */
function ranFraming(diff: ToolDiff | null, t: TFunction): Framing {
  return {
    label: t('sessions.diff.label', { name: nameOf(diff?.path ?? '') }),
    foldAfter: INLINE_DIFF_LINES,
    empty: null,
  };
}

/**
 * The preview of what a call would do: a change that applies and changes nothing says so; one that
 * would not apply is explained by its notes.
 */
function pendingFraming(diff: ToolDiff | null, t: TFunction): Framing {
  return {
    label: t('sessions.diff.pendingLabel'),
    foldAfter: PENDING_DIFF_LINES,
    empty:
      diff?.after.state === 'content' ? (
        <p className="text-xs opacity-70">{t('sessions.diff.unchanged')}</p>
      ) : null,
  };
}

/** What is said of each side that is not known. */
function SideNotes({ diff }: { readonly diff: ToolDiff }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      {[noteOf(diff.before, t), noteOf(diff.after, t)].map(
        (note, index) =>
          note !== null && (
            <p key={`${note}:${String(index)}`} className="text-ui-xs text-muted-foreground">
              {note}
            </p>
          ),
      )}
    </>
  );
}

/** When the preview was read — the disk can change before the answer (plan 08, R-06). */
function PendingNote({ readAt }: { readonly readAt: number }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const when = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'medium' }).format(
    new Date(readAt),
  );

  return <p className="text-xs opacity-70">{t('sessions.diff.pendingAt', { when })}</p>;
}
