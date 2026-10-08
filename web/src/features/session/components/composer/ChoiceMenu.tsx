import { useId } from 'react';
import { Check, ChevronUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';

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

  /** The icon of the chip, before its value. */
  readonly icon: LucideIcon;

  /** A chip in the tone of a warning — a mode that stops asking (plan 09, S-24). */
  readonly warning?: boolean;

  /** A chip in the tone of danger — the mode that stops asking about anything (plan 23, S-71). */
  readonly danger?: boolean;

  /** What the menu says before its options, in full — the warning the chip only hints at. */
  readonly note?: string | undefined;

  /**
   * Why it cannot be chosen here — the chip then only shows the value, and the tooltip says why
   * (plan 09, S-90). Translated.
   */
  readonly readOnly?: string | undefined;

  /** A submenu of another menu — the overflow of a narrow bar — rather than a chip of its own. */
  readonly sub?: boolean | undefined;
  onPick(id: string): void;
}

/** The look of a chip of the composer bar: small, flat, and its value cut before it grows. */
const CHIP =
  'inline-flex h-touch min-w-0 shrink items-center gap-1 rounded-md px-1.5 text-ui-xs ' +
  'hover:bg-accent disabled:pointer-events-none disabled:opacity-50 md:h-7 ' +
  'aria-disabled:cursor-default aria-disabled:hover:bg-transparent';

/**
 * A choice of the composer bar (plan 09, B-11) — the mode, the model, the effort: a chip with what
 * is chosen, and the list to choose from, opening **upwards**, over the conversation rather than off
 * the foot of the panel. Radix walks it with the arrows, closes it on `Esc` and gives the focus back
 * to the chip (S-36).
 */
export function ChoiceMenu(props: ChoiceMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const { label, value, disabled = false, icon: Icon, warning = false, danger = false } = props;
  const named = t('composer.chip.choice', { label, value });

  if (props.readOnly !== undefined) {
    return props.sub === true ? (
      <DropdownMenuItem disabled className="flex flex-col items-start gap-0">
        <span>{named}</span>
        <span className="text-ui-xs">{props.readOnly}</span>
      </DropdownMenuItem>
    ) : (
      <ReadOnlyChip {...props} named={named} />
    );
  }

  if (props.sub === true) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={disabled}>{named}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-w-80">
          <ChoiceItems {...props} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={named}
          className={cn(CHIP, warning && 'text-warning', danger && 'text-destructive')}
        >
          <ChipFace icon={Icon} value={value} />
          <ChevronUp className="size-3 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="max-w-80">
        <ChoiceItems {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What the open menu lists: what it is, the warning in full, and the options. */
function ChoiceItems({
  label,
  note,
  danger = false,
  options,
  current,
  onPick,
}: ChoiceMenuProps): React.JSX.Element {
  return (
    <>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {note !== undefined && (
        <p
          role="note"
          className={cn(
            'max-w-72 px-2 pb-1 text-ui-xs',
            danger ? 'text-destructive' : 'text-warning',
          )}
        >
          {note}
        </p>
      )}
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
    </>
  );
}

/**
 * A chip that only shows what is chosen: it keeps the focus, so the reason reaches the keyboard too —
 * in its description and its tooltip — and opens nothing.
 */
function ReadOnlyChip({
  named,
  value,
  icon: Icon,
  readOnly,
}: ChoiceMenuProps & { readonly named: string }): React.JSX.Element {
  const reasonId = useId();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          aria-label={named}
          aria-describedby={reasonId}
          className={cn(CHIP, 'text-muted-foreground')}
        >
          <ChipFace icon={Icon} value={value} />
          <span id={reasonId} className="sr-only">
            {readOnly}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{readOnly}</TooltipContent>
    </Tooltip>
  );
}

/** What a chip shows: its icon, and the value, cut before it grows. */
function ChipFace({
  icon: Icon,
  value,
}: {
  readonly icon: LucideIcon;
  readonly value: string;
}): React.JSX.Element {
  return (
    <>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 max-w-28 truncate">{value}</span>
    </>
  );
}
