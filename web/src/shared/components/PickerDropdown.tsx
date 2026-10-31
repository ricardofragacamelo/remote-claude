import { ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { DropdownMenuContent, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu';

export interface PickerDropdownTriggerProps {
  readonly ariaLabel: string;
  readonly className: string;
  readonly children: ReactNode;
}

/**
 * The button a dropdown picker opens from: whatever names what is active, then the chevron that
 * says there is a menu — shared by {@link SectionSelector} and `FolderTabSelector` (plan 13, B-45).
 */
export function PickerDropdownTrigger({
  ariaLabel,
  className,
  children,
}: PickerDropdownTriggerProps): React.JSX.Element {
  return (
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={ariaLabel} className={className}>
        {children}
        <ChevronsUpDown className="size-4 shrink-0" aria-hidden />
      </button>
    </DropdownMenuTrigger>
  );
}

/** The menu the trigger opens into, sized to fit a phone — the same width for every picker. */
export function PickerDropdownContent({
  children,
}: {
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)] max-w-sm">
      {children}
    </DropdownMenuContent>
  );
}
