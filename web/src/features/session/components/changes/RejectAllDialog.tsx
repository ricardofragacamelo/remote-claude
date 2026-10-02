import { useTranslation } from 'react-i18next';

import { PathList } from '@/shared/components/PathList';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { relativeTo } from '../../lib/diff-sides';
import type { ReviewedChange } from '../../hooks/useSessionChanges';

export interface RejectAllDialogProps {
  readonly open: boolean;
  readonly files: readonly ReviewedChange[];
  readonly folder: string;
  onCancel(): void;
  onConfirm(): void;
}

/**
 * "Reject everything?" — the one rejection that asks first (D-08): it reaches every file, and says
 * which by name, and that a file changed by hand after the session is kept as it is. The way out is
 * the first button, where the focus starts.
 */
export function RejectAllDialog({
  open,
  files,
  folder,
  onCancel,
  onConfirm,
}: RejectAllDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const paths = files.map((file) => relativeTo(folder, file.path) ?? file.path);

  return (
    // Opened only from outside: whatever the dialog asks of its own — Esc, a click out — is closing.
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('sessions.changes.rejectAllTitle', { count: files.length })}</DialogTitle>
          <DialogDescription>{t('sessions.changes.rejectAllDescription')}</DialogDescription>
        </DialogHeader>
        <PathList label={t('sessions.changes.listLabel')} paths={paths} />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('sessions.changes.keep')}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t('sessions.changes.rejectAllConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
