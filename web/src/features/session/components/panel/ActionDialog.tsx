import type { ReactNode } from 'react';

import { DialogFrame } from '@/shared/components/DialogFrame';
import { Button } from '@/shared/components/ui/button';

export interface ActionDialogProps {
  readonly open: boolean;

  /** `Esc` and its first button close it — a click out does not (the frame's rule). */
  onClose(): void;
  readonly title: string;
  readonly description: string;

  /** What the way out says — "Close", "Keep it running". Translated. */
  readonly closeLabel: string;

  /** What the dialog shows between its words and its buttons. */
  readonly children?: ReactNode;

  /** The button that acts, after the way out — none for a dialog that only shows. */
  readonly action?: ReactNode;
}

/**
 * A dialog of the menu of the session (plan 09, B-17): what it is, what it shows, and its buttons —
 * the way out first, where the focus starts, and then the one that acts.
 */
export function ActionDialog({
  open,
  onClose,
  title,
  description,
  closeLabel,
  children,
  action,
}: ActionDialogProps): React.JSX.Element {
  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {closeLabel}
          </Button>
          {action}
        </>
      }
    >
      {children}
    </DialogFrame>
  );
}
