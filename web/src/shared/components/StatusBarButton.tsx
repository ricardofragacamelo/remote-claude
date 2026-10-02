import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';

/** The classes of an item of the status bar: 44 px under `md`, the bar's own height above. */
export const STATUS_BAR_ITEM =
  'flex min-h-touch items-center gap-1 rounded-sm px-1 whitespace-nowrap hover:bg-statusbar-foreground/10 md:min-h-0';

export interface StatusBarButtonProps {
  readonly icon: LucideIcon;

  /** What pressing it does, in full — its accessible name and its tooltip. Translated. */
  readonly label: string;
  onClick(): void;

  /** What the bar shows of it, short. */
  readonly children: ReactNode;
}

/** An item of the status bar that does something: short on the bar, said in full on hover and aloud. */
export function StatusBarButton({
  icon: Icon,
  label,
  onClick,
  children,
}: StatusBarButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className={STATUS_BAR_ITEM} onClick={onClick}>
          <Icon className="size-3.5" aria-hidden />
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
