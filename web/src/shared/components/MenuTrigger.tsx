import type { ReactElement } from 'react';

import { DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';

export interface MenuTriggerProps {
  /** What the menu is — translated. The tooltip says it; the control names itself with it too. */
  readonly label: string;

  /** The control that opens the menu — a button that takes a ref. */
  readonly children: ReactElement;
}

/**
 * What opens a menu, with its tooltip: the two triggers of Radix on one control — the tooltip's for
 * the pointer and the focus, the menu's for the click and the keys. Written once, because a control
 * that only shows an icon owes a tooltip to everyone who does not read its `aria-label`
 * (docs/architecture/web/03-ui-system.md#o-sistema-visual).
 */
export function MenuTrigger({ label, children }: MenuTriggerProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
