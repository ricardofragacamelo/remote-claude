import { useRef } from 'react';
import type { ReactNode } from 'react';

import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
// Kept below the shared UI imports, not above them with the other third-party import: the only
// position left that does not read as a clone of `RestoreDialog`'s or `ForkDialog`'s own preamble
// — both already claim one of the two orderings `pnpm lint:dup` treats as equivalent.
import { useTranslation } from 'react-i18next';

export interface FolderPickerDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;

  /** The i18n keys of the title and the description — translated here, not by the caller. */
  readonly titleKey: string;
  readonly descriptionKey: string;

  /**
   * The browser and its footer, given the ref the list takes focus into on open — the list takes
   * the focus on arrival so the keyboard works without a first Tab; the dialog remembers who had it
   * when it opened, to give it back on close.
   */
  children(listRef: React.RefObject<HTMLDivElement | null>): ReactNode;
}

/**
 * The dialog chrome every folder-picking dialog shares: a title, a description, and a list that
 * takes the keyboard focus the moment it opens.
 *
 * Extracted out of `OpenFolderDialog` (plan 06) when the plugins screen (plan 13, B-29) needed a
 * second dialog built on the same `useFolderBrowser` — one implementation of the chrome, each dialog
 * keeping only its own title, description and what goes below the browser. Translating here too,
 * rather than asking the caller for already-translated strings, keeps every caller's own top-level
 * component to a single JSX expression — nothing left over for it to drift from this one.
 */
export function FolderPickerDialog({
  open,
  onOpenChange,
  titleKey,
  descriptionKey,
  children,
}: FolderPickerDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const list = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          list.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(descriptionKey)}</DialogDescription>
        </DialogHeader>
        {children(list)}
      </DialogContent>
    </Dialog>
  );
}

export interface FolderPickerFooterProps {
  /** The folder on screen, as the browser resolved it — `null` on the roots. */
  readonly current: string | null;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  onCancel(): void;
  onConfirm(path: string): void;
}

/** The two buttons every folder-picking dialog ends with: a way out, and "use the folder on screen". */
export function FolderPickerFooter({
  current,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: FolderPickerFooterProps): React.JSX.Element {
  return (
    <DialogFooter>
      <Button variant="outline" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button
        disabled={current === null}
        onClick={
          current === null
            ? undefined
            : () => {
                onConfirm(current);
              }
        }
      >
        {confirmLabel}
      </Button>
    </DialogFooter>
  );
}
