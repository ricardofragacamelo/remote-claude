import { Check, ChevronDown } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';

/** One option of a choice. */
export interface ChoiceOption {
  readonly id: string;
  readonly label: string;

  /** What choosing it means, in full — the description of a model, what a mode stops asking. */
  readonly description?: string;
}

export interface ChoiceMenuProps {
  /** What is chosen — its accessible name says it with the value. Translated. */
  readonly label: string;
  readonly value: string;
  readonly options: readonly ChoiceOption[];
  readonly current: string | null;
  readonly disabled?: boolean;
  onPick(id: string): void;
}

/** A compact choice of the header of the panel: what is chosen, and the list to choose from. */
export function ChoiceMenu({
  label,
  value,
  options,
  current,
  disabled = false,
  onPick,
}: ChoiceMenuProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled} aria-label={`${label}: ${value}`}>
          <span className="max-w-32 truncate">{value}</span>
          <ChevronDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-80">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onSelect={() => {
              onPick(option.id);
            }}
            className="flex items-start gap-2"
          >
            <Check
              className={option.id === current ? 'mt-0.5 size-4' : 'mt-0.5 size-4 opacity-0'}
              aria-hidden
            />
            <span className="flex flex-col">
              <span>{option.label}</span>
              {option.description !== undefined && option.description !== '' && (
                <span className="text-ui-xs text-muted-foreground">{option.description}</span>
              )}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
