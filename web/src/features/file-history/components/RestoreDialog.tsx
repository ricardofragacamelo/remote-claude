import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import type { Restorer } from '../hooks/useRestore';
import { useTimelineState } from '../hooks/useTimeline';
import { whenOf } from '../lib/entries';

export interface RestoreDialogProps {
  readonly folder: string;
  readonly restorer: Restorer;
}

/**
 * The one question a restore asks — only when there is something to lose or to know first: the
 * unsaved changes of the file's buffer, which a restore discards (S-346), and a file that changes
 * what Claude may do (07 · D-15). The way out is the first button and takes the focus.
 */
export function RestoreDialog({ folder, restorer }: RestoreDialogProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const question = useTimelineState(folder, (state) => state.question);
  const keep = useRef<HTMLButtonElement>(null);
  const when = question === null ? '' : whenOf(question.entry.at, i18n.language);
  const path = question?.entry.path ?? '';

  return (
    <Dialog
      open={question !== null}
      onOpenChange={(open) => {
        if (!open) {
          restorer.cancel();
        }
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          keep.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('fileHistory.restore.title', { path, when })}</DialogTitle>
          <DialogDescription>
            {t(
              question?.dirty === true
                ? 'fileHistory.restore.discards'
                : 'fileHistory.restore.replaces',
              { path },
            )}
          </DialogDescription>
        </DialogHeader>
        {question?.sensitive === true && (
          <p className="text-ui">{t('fileHistory.restore.sensitive', { path })}</p>
        )}
        <DialogFooter>
          <Button ref={keep} variant="outline" onClick={restorer.cancel}>
            {t('fileHistory.restore.cancel')}
          </Button>
          <Button variant="destructive" onClick={restorer.confirm}>
            {t('fileHistory.restore.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
