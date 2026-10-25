import { ChevronsUpDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import type { SectionTabEntry } from './SectionTabs';

export interface SectionSelectorProps<T extends SectionTabEntry> {
  readonly entries: readonly T[];
  readonly active: T | undefined;

  /** The trigger's own accessible name, given what is active now — `''` when nothing is. */
  pickLabel(activeLabel: string): string;

  /** The label of one entry — a section's title, with whatever it interpolates. */
  label(entry: T): string;
  onSelect(id: string): void;
}

/**
 * The same sections {@link SectionTabs} draws as a row or a column from `md` up, picked from a menu
 * instead, under it — the screen's own navigation becomes one control that fits a phone, rather than
 * wrapping into rows of its own (plan 13, B-45, S-195). The shape plan 06's own `FolderTabSelector`
 * already gives the folder tabs under `md` (S-110): a trigger naming what is active, a radio group of
 * everything else. `onSelect` takes the id straight from the radio group, the same way
 * `FolderTabSelector` hands `control.activate` the raw path — never a lookup that could fail to find
 * what the group itself just offered.
 */
export function SectionSelector<T extends SectionTabEntry>({
  entries,
  active,
  pickLabel,
  label,
  onSelect,
}: SectionSelectorProps<T>): React.JSX.Element {
  const activeLabel = active === undefined ? '' : label(active);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={pickLabel(activeLabel)}
          className="flex min-h-touch w-full items-center justify-between gap-2 rounded-md border border-border px-3 text-ui"
        >
          <span className="flex min-w-0 items-center gap-2">
            {active !== undefined && <active.icon className="size-4 shrink-0" aria-hidden />}
            <span className="truncate">{activeLabel}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)] max-w-sm">
        <DropdownMenuRadioGroup value={active?.id ?? ''} onValueChange={onSelect}>
          {entries.map((entry) => (
            <DropdownMenuRadioItem key={entry.id} value={entry.id}>
              <entry.icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{label(entry)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
