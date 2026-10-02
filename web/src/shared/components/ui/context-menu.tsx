import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The context menu primitive, in the shadcn/ui shape. Generated territory — see `button.tsx`.
 *
 * Opened by the right click, by a long press on a touch screen, and by the keyboard's context-menu
 * key or `Shift+F10`, which the browser turns into the same event. Radix moves the focus into the
 * menu, walks it with the arrows and gives the focus back on `Esc`.
 *
 * CUSTOM: not modal unless asked. A modal menu hides the rest of the page from assistive technology
 * with `aria-hidden` while it stays focusable, which axe reports as `aria-hidden-focus` — a menu is
 * not a dialog, and the WAI-ARIA menu pattern does not hide the page (plan 07 · S-289). Outside
 * clicks and `Esc` still close it, and the focus still moves in and comes back.
 */
export function ContextMenu({
  modal = false,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Root>): React.JSX.Element {
  return <ContextMenuPrimitive.Root modal={modal} {...props} />;
}
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={cn(
          'z-50 min-w-40 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-md',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Item>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        'flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm outline-none select-none',
        'focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

// CUSTOM: the separator, the submenu and the shortcut of an item, as the generator writes them — the
// Explorer's menu groups its items, opens "New from template ›" and shows each item's key (plan 07).
export function ContextMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Separator>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

export const ContextMenuSub = ContextMenuPrimitive.Sub;

export function ContextMenuSubTrigger({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.SubTrigger>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={cn(
        'flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm outline-none select-none',
        'focus:bg-muted data-[state=open]:bg-muted data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function ContextMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.SubContent>): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        className={cn(
          'z-50 min-w-40 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-md',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuShortcut({
  className,
  ...props
}: ComponentProps<'span'>): React.JSX.Element {
  return (
    <span className={cn('ml-auto pl-4 text-xs text-muted-foreground', className)} {...props} />
  );
}
