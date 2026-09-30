import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';

export interface RailMenuTriggerProps {
  /** What the menu is — translated. The accessible name and the tooltip. */
  readonly label: string;
  readonly icon: LucideIcon;
  readonly className: string;

  /** What shows beside the icon, when the trigger is wide enough for it. */
  readonly children?: ReactNode;
}

/**
 * The button that opens a menu at the foot of the navigation — "manage", the account: labelled for
 * a screen reader and with a tooltip for everyone else, as every control that is only an icon.
 * Rendered inside a `DropdownMenu`.
 */
export function RailMenuTrigger({
  label,
  icon: Icon,
  className,
  children,
}: RailMenuTriggerProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn('flex items-center gap-2 rounded-md text-ui', className)}
          >
            <Icon className="size-5" aria-hidden />
            {children}
          </button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
