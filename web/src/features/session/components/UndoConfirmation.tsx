import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { Checkpoint } from '../types/checkpoint';
import { FileGroups } from './FileGroups';

/** What undoing would do to each file, in the order the confirmation says it. */
const SCOPE_TITLES = {
  restore: 'undo.scope.restore',
  remove: 'undo.scope.remove',
  preserve: 'undo.scope.preserve',
  unchanged: 'undo.scope.unchanged',
} as const;

export interface UndoConfirmationProps {
  readonly checkpoint: Checkpoint;

  /** The name of the point, already translated when the turn had no prompt to name it by. */
  readonly label: string;

  /** Whether the undo may be asked for now — not while a turn runs, not twice at once. */
  readonly canConfirm: boolean;

  onConfirm(): void;
  onCancel(): void;
}

/**
 * The second step of an undo: exactly what it reaches, before it reaches it.
 *
 * Confirmation without the list is confirmation without information (S-38). So it says to which
 * point, which files go back and which are deleted because the turn created them, which **stay**
 * and why — a file somebody edited by hand afterwards is kept, never overwritten — and which are
 * already the way they were.
 *
 * A point where nothing would go back offers nothing to confirm, and says why rather than showing a
 * button that would do nothing. The focus lands on the way out, as on every destructive step of
 * this product: the accident this step exists for is one stray Enter.
 */
export function UndoConfirmation({
  checkpoint,
  label,
  canConfirm,
  onConfirm,
  onCancel,
}: UndoConfirmationProps): React.JSX.Element {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const reverts = checkpoint.restore.length + checkpoint.remove.length;

  return (
    <div
      role="group"
      aria-label={t('undo.confirm.title')}
      className="flex flex-col gap-3 rounded border border-border p-3"
    >
      <p className="text-sm font-semibold">{t('undo.confirm.title')}</p>
      <p className="text-sm">{t('undo.confirm.target', { label, at: checkpoint.at })}</p>

      <FileGroups titles={SCOPE_TITLES} files={checkpoint} />

      {reverts === 0 && <p className="text-sm">{t('undo.confirm.nothing')}</p>}

      <div className="flex flex-wrap gap-2">
        {/* First in the DOM, and so first in the tab order: the way out, not the undo. */}
        <Button ref={cancelRef} variant="outline" size="touch" onClick={onCancel}>
          {t('undo.confirm.cancel')}
        </Button>
        <Button
          variant="destructive"
          size="touch"
          disabled={!canConfirm || reverts === 0}
          onClick={onConfirm}
        >
          {t('undo.confirm.confirm')}
        </Button>
      </div>
    </div>
  );
}
