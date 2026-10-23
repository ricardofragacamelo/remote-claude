import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { useFolderBrowser } from '../hooks/useFolderBrowser';
import type { Workspace } from '../types/workspace';
import { AllowlistHint } from './AllowlistHint';
import { FolderBrowserPanel } from './FolderBrowserPanel';
import { FolderPickerDialog, FolderPickerFooter } from './FolderPickerChrome';

export interface OpenFolderDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;

  /** The root to start inside, or `null` to start on the roots. */
  readonly startAt: Workspace | null;

  /** Called with the folder to open — the one on screen, as the server resolved it. */
  onOpen(path: string): void;
}

/**
 * "Open folder": the roots on top, one level at a time below them, and nothing above a root.
 *
 * Built on the dialog primitive, which holds the focus inside, closes on `Esc` and gives the focus
 * back to whoever opened it. Everything inside is reset each time it opens — the browser lives in
 * the dialog's content, which unmounts on close.
 */
export function OpenFolderDialog({
  open,
  onOpenChange,
  startAt,
  onOpen,
}: OpenFolderDialogProps): React.JSX.Element {
  return (
    <FolderPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      titleKey="workspace.dialog.title"
      descriptionKey="workspace.dialog.description"
    >
      {(list) => (
        <Browser
          listRef={list}
          startAt={startAt}
          onOpen={onOpen}
          onCancel={() => {
            onOpenChange(false);
          }}
        />
      )}
    </FolderPickerDialog>
  );
}

interface BrowserProps {
  readonly listRef: React.RefObject<HTMLDivElement | null>;
  readonly startAt: Workspace | null;
  onOpen(path: string): void;
  onCancel(): void;
}

/**
 * The inside of the dialog.
 *
 * The list is an ARIA listbox that keeps the focus while the keyboard moves through it
 * (`aria-activedescendant`): the arrows walk, `Enter` goes in, `Backspace` and `Alt+↑` go up, and
 * typing narrows by prefix. "Open" opens the folder on screen — nobody has to go into a subfolder to
 * open the one they are in.
 */
function Browser({ listRef: list, startAt, onOpen, onCancel }: BrowserProps): React.JSX.Element {
  const { t } = useTranslation();
  const browser = useFolderBrowser(startAt);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <FolderBrowserPanel browser={browser} listRef={list} />

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="self-start"
          aria-expanded={helpOpen}
          onClick={() => {
            setHelpOpen(!helpOpen);
          }}
        >
          {t('workspace.dialog.helpToggle')}
        </Button>
        {helpOpen && (
          <div className="flex flex-col gap-2 text-sm">
            <p>{t('workspace.dialog.helpBody')}</p>
            <AllowlistHint />
          </div>
        )}
      </div>

      <FolderPickerFooter
        current={browser.current}
        cancelLabel={t('workspace.dialog.cancel')}
        confirmLabel={t('workspace.dialog.open')}
        onCancel={onCancel}
        onConfirm={onOpen}
      />
    </>
  );
}
