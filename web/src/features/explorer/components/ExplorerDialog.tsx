import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';

export interface ExplorerDialogProps {
  readonly open: boolean;

  /** `Esc` — the only change a dialog an operation opened reports. */
  onClose(): void;

  /** Translated. */
  readonly title: string;
  readonly description: string;
  readonly footer: ReactNode;
  readonly children?: ReactNode;

  /** Where the focus goes when it closes — the opener's, unless this prevents it. */
  onCloseAutoFocus?(event: Event): void;
}

/**
 * A dialog of the Explorer: a title, what it is about, the body, the answers. Only its buttons and
 * `Esc` close it — the second click of a double click lands outside the dialog it just opened, and
 * would dismiss the question before it was read (as the close of a folder tab does, plan 06).
 */
export function ExplorerDialog({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  onCloseAutoFocus,
}: ExplorerDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-2">{children}</div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Paths, one per line, as code — what a dialog is about. */
export function PathList({
  label,
  paths,
}: {
  readonly label: string;
  readonly paths: readonly string[];
}): React.JSX.Element {
  return (
    <ul aria-label={label} className="flex flex-col gap-0.5 text-ui-sm">
      {paths.map((each) => (
        <li key={each} className="font-code break-all">
          {each}
        </li>
      ))}
    </ul>
  );
}
