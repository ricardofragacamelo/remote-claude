import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useUndo } from '../hooks/useUndo';
import { Disclosure } from './Disclosure';
import { RewindReport } from './RewindReport';
import { UndoConfirmation } from './UndoConfirmation';

export interface UndoPanelProps {
  readonly sessionId: string;
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
 * the panel says so instead of listing points nobody can use (S-39).
 */
export function UndoPanel({ sessionId }: UndoPanelProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Disclosure label={t('undo.panel.toggle')} title={t('undo.panel.title')}>
      {() => <UndoPoints sessionId={sessionId} />}
    </Disclosure>
  );
}

/** The open panel: where the session stands, the last outcome, and the points to go back to. */
function UndoPoints({ sessionId }: UndoPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string | null>(null);
  const undo = useUndo(sessionId);
  const canConfirm = undo.availability === 'ready' && !undo.isRewinding;
  const showsList = !undo.isLoading && undo.error === null;

  return (
    <>
      <p className="text-xs opacity-70">{t('undo.panel.description')}</p>

      {undo.availability === 'ended' ? (
        <p className="text-sm" role="note">
          {t('undo.panel.ended')}
        </p>
      ) : (
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

          {undo.isLoading && (
            <Skeleton className="h-16 w-full" aria-label={t('undo.panel.loading')} />
          )}

          {undo.error !== null && <ErrorState error={undo.error} onRetry={undo.reload} />}

          {showsList && undo.checkpoints.length === 0 && (
            <EmptyState
              title={t('undo.panel.emptyTitle')}
              description={t('undo.panel.emptyDescription')}
            />
          )}

          {showsList && undo.checkpoints.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label={t('undo.panel.title')}>
              {undo.checkpoints.map((checkpoint) => {
                const label = checkpoint.label ?? t('undo.panel.untitled');

                return (
                  <li key={checkpoint.promptId} className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      className="h-auto w-full justify-start py-2"
                      aria-expanded={chosen === checkpoint.promptId}
                      disabled={undo.isRewinding}
                      onClick={() => {
                        setChosen(checkpoint.promptId);
                      }}
                    >
                      <span className="flex flex-col items-start gap-0.5 text-left">
                        <span className="text-sm font-medium">{label}</span>
                        <span className="text-xs opacity-70">
                          {t('undo.panel.startedAt', { at: checkpoint.at })}
                        </span>
                      </span>
                    </Button>

                    {chosen === checkpoint.promptId && (
                      <UndoConfirmation
                        checkpoint={checkpoint}
                        label={label}
                        canConfirm={canConfirm}
                        onConfirm={() => {
                          setChosen(null);
                          undo.rewind(checkpoint.promptId);
                        }}
                        onCancel={() => {
                          setChosen(null);
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
