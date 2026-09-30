import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import { Button } from '@/shared/components/ui/button';
import { folderName } from '@/shared/lib/folder-name';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import type { FolderTabs } from '../hooks/useFolderTabs';

export interface CloseFoldersDialogProps {
  readonly control: FolderTabs;
}

/**
 * "Close these folders?" — and the one thing a person might fear, said plainly: **the Claude sessions
 * of those folders carry on**, on this machine, because they live in the backend and not in the tab
 * (plan 06, S-101).
 *
 * The way out is where the focus starts, not the closing — it is the first button, and the dialog
 * focuses its first: an Enter pressed out of habit keeps the tabs
 * (docs/architecture/web/03-ui-system.md#acessibilidade--não-é-opcional).
 */
export function CloseFoldersDialog({ control }: CloseFoldersDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const closing = control.closing ?? [];
  const names = closing.map(folderName);

  return (
    <Dialog
      open={control.closing !== null}
      // Nothing here opens it but the tabs, so the only change it reports is `Esc` closing it.
      onOpenChange={control.cancelClose}
    >
      <DialogContent
        // Only its buttons and `Esc` close it: the second click of a double click on "close" lands
        // outside the dialog it just opened, and would dismiss the question before it is read (S-109).
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {names.length === 1
              ? t('workbench.close.titleOne', { name: names.join('') })
              : t('workbench.close.titleMany', { count: names.length })}
          </DialogTitle>
          <DialogDescription>{t('workbench.close.sessionsCarryOn')}</DialogDescription>
        </DialogHeader>

        {closing.length > 1 && (
          <ul className="flex flex-col gap-1 text-ui" aria-label={t('workbench.close.listLabel')}>
            {closing.map((path) => (
              <li key={path} className="font-code text-ui-sm break-all">
                {path}
              </li>
            ))}
          </ul>
        )}

        {control.failure !== null && <ErrorState error={control.failure} />}

        <DialogFooter>
          <Button variant="outline" disabled={control.isClosing} onClick={control.cancelClose}>
            {t('workbench.close.keep')}
          </Button>
          <Button disabled={control.isClosing} onClick={control.confirmClose}>
            {control.isClosing ? t('workbench.close.pending') : t('workbench.close.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
