import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import type { PendingFork } from '../../hooks/useSessionsView';

/**
 * The confirmation before continuing a conversation that something else is writing now (S-42): the
 * continuation here lives under a new id, the other process keeps writing the original, and the two
 * will diverge. Said before, never after.
 */
export function ForkDialog({
  fork,
}: {
  readonly fork: PendingFork | null;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (fork === null) {
    return null;
  }

  // Open only while a fork waits for its answer: closing it — Escape, outside — is "no".
  return (
    <Dialog
      open
      onOpenChange={() => {
        fork.cancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('sessions.fork.title')}</DialogTitle>
          <DialogDescription>{t('sessions.fork.description')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={fork.cancel}>
            {t('sessions.fork.cancel')}
          </Button>
          <Button onClick={fork.confirm}>{t('sessions.fork.confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
