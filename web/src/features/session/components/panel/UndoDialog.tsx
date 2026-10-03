import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useUndo } from '../../hooks/useUndo';
import type { Undo } from '../../hooks/useUndo';
import type { Checkpoint } from '../../types/checkpoint';
import { RewindReport } from '../RewindReport';
import { UndoConfirmation } from '../UndoConfirmation';
import { ActionDialog } from './ActionDialog';

export interface UndoDialogProps {
  readonly sessionId: string;
  readonly open: boolean;
  onClose(): void;

  /**
   * The prompt the undo was asked from — "put the files back to here" (plan 09, B-27): its point is
   * open, with the reach of going back to it, when the dialog opens. Absent from the menu.
   */
  readonly prompt?: string | null | undefined;
}

/**
 * Undoing what the session wrote to disk.
 *
 * Approving a `Write` from a phone, on the bus, is a decision taken with less context than the same
 * one at the desk — the undo is what makes that risk acceptable. And it is itself an operation on
 * the user's disk, so it is never one click: a point is chosen, the reach of undoing to it is shown
 * file by file, and only then is it asked for.
 *
 * While a turn is running the undo is refused by the backend (`SESSION_LOCKED`), so the screen
 * disables it first and says why (S-43); once the session has ended there is no undo at all, and
 * the dialog says so instead of listing points nobody can use (S-39).
 *
 * A dialog of the menu of the session since plan 09 (B-17), with the same reach, file by file — and
 * of each prompt of the conversation (B-27), opened at that prompt's point. It asks for the points
 * only while open.
 */
export function UndoDialog({
  sessionId,
  open,
  onClose,
  prompt = null,
}: UndoDialogProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={t('undo.panel.title')}
      description={t('undo.panel.description')}
      closeLabel={t('undo.panel.close')}
    >
      <UndoPoints sessionId={sessionId} prompt={prompt} />
    </ActionDialog>
  );
}

/** The open dialog: where the session stands, the last outcome, and the points to go back to. */
function UndoPoints({
  sessionId,
  prompt,
}: {
  readonly sessionId: string;
  readonly prompt: string | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  // `undefined` until the person chooses: until then, the point of the prompt it was opened from —
  // the one labelled with what the prompt said, as editing a prompt finds it (plan 08, B-35).
  const [picked, setChosen] = useState<string | null | undefined>(undefined);
  const undo = useUndo(sessionId);
  const chosen =
    picked === undefined
      ? (undo.checkpoints.find((checkpoint) => prompt !== null && checkpoint.label === prompt)
          ?.promptId ?? null)
      : picked;

  return (
    <>
      {undo.availability === 'ended' ? (
        <p className="text-sm" role="note">
          {t('undo.panel.ended')}
        </p>
      ) : (
        <>
          <UndoStatus undo={undo} />
          <Checkpoints undo={undo} chosen={chosen} onChoose={setChosen} />
        </>
      )}
    </>
  );
}

/** Where the session stands, and what the last undo did or why it did not. */
function UndoStatus({ undo }: { readonly undo: Undo }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      {undo.availability === 'busy' && (
        <p className="text-sm" role="note">
          {t('undo.panel.busy')}
        </p>
      )}

      {undo.isRewinding && (
        <p className="text-sm" role="status">
          {t('undo.panel.rewinding')}
        </p>
      )}

      {undo.refusal !== null && <ErrorState error={undo.refusal} />}
      {undo.incomplete !== null && <ErrorState error={undo.incomplete} />}
      {undo.outcome !== null && <RewindReport outcome={undo.outcome} />}
    </>
  );
}

interface CheckpointsProps {
  readonly undo: Undo;

  /** The point whose confirmation is open, if any. */
  readonly chosen: string | null;
  onChoose(promptId: string | null): void;
}

/** The four states of the points: loading, failed, none, and the list. */
function Checkpoints({ undo, chosen, onChoose }: CheckpointsProps): React.JSX.Element {
  const { t } = useTranslation();
  const showsList = !undo.isLoading && undo.error === null;

  return (
    <>
      {undo.isLoading && <Skeleton className="h-16 w-full" aria-label={t('undo.panel.loading')} />}

      {undo.error !== null && <ErrorState error={undo.error} onRetry={undo.reload} />}

      {showsList && undo.checkpoints.length === 0 && (
        <EmptyState
          title={t('undo.panel.emptyTitle')}
          description={t('undo.panel.emptyDescription')}
        />
      )}

      {showsList && undo.checkpoints.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('undo.panel.title')}>
          {undo.checkpoints.map((checkpoint) => (
            <CheckpointItem
              key={checkpoint.promptId}
              checkpoint={checkpoint}
              undo={undo}
              isChosen={chosen === checkpoint.promptId}
              onChoose={onChoose}
            />
          ))}
        </ul>
      )}
    </>
  );
}

interface CheckpointItemProps {
  readonly checkpoint: Checkpoint;
  readonly undo: Undo;
  readonly isChosen: boolean;
  onChoose(promptId: string | null): void;
}

/** One point to go back to, and — once chosen — the reach of going back to it. */
function CheckpointItem({
  checkpoint,
  undo,
  isChosen,
  onChoose,
}: CheckpointItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const label = checkpoint.label ?? t('undo.panel.untitled');

  return (
    <li className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="touch"
        className="h-auto w-full justify-start py-2"
        aria-expanded={isChosen}
        disabled={undo.isRewinding}
        onClick={() => {
          onChoose(checkpoint.promptId);
        }}
      >
        <span className="flex flex-col items-start gap-0.5 text-left">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs opacity-70">
            {t('undo.panel.startedAt', { at: checkpoint.at })}
          </span>
        </span>
      </Button>

      {isChosen && (
        <UndoConfirmation
          checkpoint={checkpoint}
          label={label}
          canConfirm={undo.availability === 'ready' && !undo.isRewinding}
          onConfirm={() => {
            onChoose(null);
            undo.rewind(checkpoint.promptId);
          }}
          onCancel={() => {
            onChoose(null);
          }}
        />
      )}
    </li>
  );
}
