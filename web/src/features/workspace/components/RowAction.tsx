import type { LucideIcon } from 'lucide-react';

import { IconButton } from '@/shared/components/IconButton';

export interface RowActionProps {
  readonly icon: LucideIcon;

  /** Already translated: an icon button says what it does to a screen reader, and on hover. */
  readonly label: string;
  readonly busy: boolean;
  onClick(): void;
}

/**
 * One of the icon buttons of a recent folder's row — a tooltip and a translated name, as every
 * control that is only an icon (plan 06, S-151) — held while a change to the row is on its way.
 */
export function RowAction({ icon, label, busy, onClick }: RowActionProps): React.JSX.Element {
  return (
    <IconButton
      icon={icon}
      label={label}
      disabled={busy}
      className="border border-border"
      onClick={onClick}
    />
  );
}
