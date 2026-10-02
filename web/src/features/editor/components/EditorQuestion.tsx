import type { ReactNode, RefObject } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { focusEditor } from '../hooks/views';

/**
 * One question of the editor, as a dialog: the focus starts where `start` says, and comes back to the editor.
 */
export interface EditorQuestionProps {
  readonly folder: string;
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly start: RefObject<HTMLElement | null>;
  onDismiss(): void;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}

export function EditorQuestion({
  folder,
  open,
  title,
  description,
  start,
  onDismiss,
  children,
  footer,
}: EditorQuestionProps): React.JSX.Element {
  return (
    <Dialog
      open={open}
      // Nothing here opens it but the editor, so the only change it reports is `Esc` closing it.
      onOpenChange={onDismiss}
    >
      <DialogContent
        // Only its buttons and `Esc` answer it: a stray click outside is not an answer.
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          start.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          // Back to the editor the question was about (S-268).
          event.preventDefault();
          focusEditor(folder);
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
