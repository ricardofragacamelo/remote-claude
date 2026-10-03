import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';

export interface DialogFrameProps {
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
 * A dialog that asks: a title, what it is about, the body, the answers. Only its buttons and `Esc`
 * close it — the second click of a double click lands outside the dialog it just opened, and would
 * dismiss the question before it was read (as the close of a folder tab does, plan 06). The
 * Explorer's (plan 07) and the session menu's (plan 09, B-17).
 */
export function DialogFrame({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  onCloseAutoFocus,
}: DialogFrameProps): React.JSX.Element {
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
