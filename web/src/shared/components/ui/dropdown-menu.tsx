import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The dropdown menu primitive, in the shadcn/ui shape. Generated territory — see `button.tsx`.
 *
 * Radix walks it with the arrows, types ahead, closes on `Esc` and gives the focus back to the
 * trigger — the menu button pattern of WAI-ARIA, which a list of buttons in a `div` is not.
 */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const item =
  'relative flex min-h-touch cursor-default items-center gap-2 rounded-sm px-2 text-ui outline-none ' +
  'select-none focus:bg-accent focus:text-accent-foreground md:min-h-row md:py-1 ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-h-[80dvh] min-w-48 overflow-y-auto rounded-md border border-border bg-popover p-1',
          'text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>): React.JSX.Element {
  return <DropdownMenuPrimitive.Item className={cn(item, className)} {...props} />;
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn(item, 'pl-7', className)} {...props}>
      <span className="absolute left-2 flex size-3 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <span className="size-2 rounded-full bg-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

// CUSTOM: the submenu, for a menu of the composer bar that holds other choices when the bar is too
// narrow for them (plan 09, B-11) — the shape of shadcn/ui's own, on the same item style.
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

export function DropdownMenuSubTrigger({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cn(item, 'data-[state=open]:bg-accent', className)}
      {...props}
    />
  );
}

export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubContent>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        className={cn(
          'z-50 max-h-[80dvh] min-w-48 overflow-y-auto rounded-md border border-border bg-popover p-1',
          'text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2 py-1 text-ui-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}
