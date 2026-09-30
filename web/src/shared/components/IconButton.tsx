import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';

const iconButton = cva(
  'inline-flex shrink-0 items-center justify-center rounded-md text-current transition-colors ' +
    'hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 ' +
    'aria-pressed:bg-accent aria-pressed:text-accent-foreground',
  {
    variants: {
      size: {
        // 44 px under `md`, where a finger is the pointer; dense above it, where a mouse is.
        chrome: 'size-touch md:size-7',
        rail: 'size-touch md:size-12',
      },
    },
    defaultVariants: { size: 'chrome' },
  },
);

export type IconButtonProps = Omit<ComponentProps<'button'>, 'children' | 'aria-label'> &
  VariantProps<typeof iconButton> & {
    /** What it does — translated. It is the accessible name **and** the tooltip. */
    readonly label: string;
    readonly icon: LucideIcon;
  };

/**
 * A control that is only an icon.
 *
 * Written once because the rule is two halves, and a hand-rolled one forgets the second: a
 * translated `aria-label` for the screen reader **and** a tooltip for everyone else
 * (docs/architecture/web/03-ui-system.md#o-sistema-visual). The label is required by the type.
 */
export function IconButton({
  label,
  icon: Icon,
  size,
  className,
  type = 'button',
  ...props
}: IconButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type={type}
          aria-label={label}
          className={cn(iconButton({ size }), className)}
          {...props}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
