import type { Ref } from 'react';

import { Button } from '@/shared/components/ui/button';

export interface DestructiveConfirmFooterProps {
  /** Takes the focus on open — the way out, never the destructive answer (S-173, S-135). */
  readonly keepRef: Ref<HTMLButtonElement>;
  readonly pending: boolean;
  readonly keepLabel: string;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  onCancel(): void;

  /** The confirm itself is usually async (a request); this never awaits it, or its answer. */
  onConfirm(): unknown;
}

/**
 * The footer of a destructive confirm: the way out first in DOM order, focused on open — an
 * `Enter` pressed out of habit answers nothing destructive — and the destructive answer never
 * programmatically focused (the explorer's own `DeleteDialog`, the MCP settings' own
 * `RemoveServerDialog`, the same discipline both need, S-135, S-174).
 */
export function DestructiveConfirmFooter({
  keepRef,
  pending,
  keepLabel,
  confirmLabel,
  pendingLabel,
  onCancel,
  onConfirm,
}: DestructiveConfirmFooterProps): React.JSX.Element {
  return (
    <>
      <Button ref={keepRef} variant="outline" disabled={pending} onClick={onCancel}>
        {keepLabel}
      </Button>
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() => {
          void onConfirm();
        }}
      >
        {pending ? pendingLabel : confirmLabel}
      </Button>
    </>
  );
}
