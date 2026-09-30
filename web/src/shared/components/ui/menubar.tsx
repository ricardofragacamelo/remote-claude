import * as MenubarPrimitive from '@radix-ui/react-menubar';
import { ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The menubar primitive, in the shadcn/ui shape. Generated territory — see `button.tsx`.
 *
 * Radix walks it as the menubar pattern of WAI-ARIA: the arrows move between the menus of the bar
 * and between the items of a menu, a submenu opens to the right, `Esc` closes and gives the focus
 * back to the menu's trigger.
 */
export const MenubarMenu = MenubarPrimitive.Menu;
export const MenubarGroup = MenubarPrimitive.Group;
export const MenubarSub = MenubarPrimitive.Sub;

const item =
  'relative flex min-h-touch cursor-default items-center gap-2 rounded-sm px-2 text-ui outline-none ' +
  'select-none focus:bg-accent focus:text-accent-foreground md:min-h-row md:py-1 ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

export function Menubar({
  className,
  ...props
}: ComponentProps<typeof MenubarPrimitive.Root>): React.JSX.Element {
  return <MenubarPrimitive.Root className={cn('flex items-center gap-1', className)} {...props} />;
}

export function MenubarTrigger({
  className,
  ...props
}: ComponentProps<typeof MenubarPrimitive.Trigger>): React.JSX.Element {
  return (
    <MenubarPrimitive.Trigger
      className={cn(
        'flex min-h-touch cursor-default items-center rounded-sm px-2 text-ui outline-none select-none',
        'focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent',
        'data-[state=open]:text-accent-foreground md:min-h-0 md:py-0.5',
        className,
      )}
      {...props}
    />
  );
}

export function MenubarContent({
  className,
  align = 'start',
  sideOffset = 4,
  ...props
}: ComponentProps<typeof MenubarPrimitive.Content>): React.JSX.Element {
  return (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-h-[80dvh] min-w-56 overflow-y-auto rounded-md border border-border bg-popover p-1',
          'text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </MenubarPrimitive.Portal>
  );
}

export function MenubarItem({
  className,
  ...props
}: ComponentProps<typeof MenubarPrimitive.Item>): React.JSX.Element {
  return <MenubarPrimitive.Item className={cn(item, className)} {...props} />;
}

export function MenubarSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof MenubarPrimitive.SubTrigger>): React.JSX.Element {
  return (
    <MenubarPrimitive.SubTrigger
      className={cn(item, 'data-[state=open]:bg-accent', className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-4" aria-hidden />
    </MenubarPrimitive.SubTrigger>
  );
}

export function MenubarSubContent({
  className,
  ...props
}: ComponentProps<typeof MenubarPrimitive.SubContent>): React.JSX.Element {
  return (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.SubContent
        className={cn(
          'z-50 max-h-[80dvh] min-w-56 overflow-y-auto rounded-md border border-border bg-popover p-1',
          'text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </MenubarPrimitive.Portal>
  );
}

export function MenubarSeparator({
  className,
  ...props
}: ComponentProps<typeof MenubarPrimitive.Separator>): React.JSX.Element {
  return (
    <MenubarPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
  );
}

export function MenubarShortcut({ className, ...props }: ComponentProps<'kbd'>): React.JSX.Element {
  return (
    <kbd
      className={cn(
        'ml-auto pl-4 font-code text-ui-sm tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
