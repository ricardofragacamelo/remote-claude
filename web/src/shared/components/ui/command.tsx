import { Command as CommandPrimitive } from 'cmdk';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The command primitive, in the shadcn/ui shape. Generated territory — see `button.tsx`.
 *
 * `cmdk` is the combobox and listbox pattern of WAI-ARIA already wired: the input owns the focus,
 * the arrows move the active option (`aria-activedescendant`), `Enter` picks it — which a list of
 * buttons under a text field is not.
 */
export function Command({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive>): React.JSX.Element {
  return (
    <CommandPrimitive
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function CommandInput({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input>): React.JSX.Element {
  return (
    <div className="flex items-center border-b border-border px-3">
      <CommandPrimitive.Input
        className={cn(
          'flex h-10 w-full bg-transparent py-2 text-ui outline-none placeholder:text-muted-foreground',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.List>): React.JSX.Element {
  return (
    <CommandPrimitive.List
      className={cn('max-h-[60dvh] overflow-x-hidden overflow-y-auto p-1', className)}
      {...props}
    />
  );
}

export function CommandEmpty({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Empty>): React.JSX.Element {
  return (
    <CommandPrimitive.Empty
      className={cn('px-2 py-6 text-center text-ui text-muted-foreground', className)}
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Group>): React.JSX.Element {
  return (
    <CommandPrimitive.Group
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1',
        '[&_[cmdk-group-heading]]:text-ui-sm [&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Item>): React.JSX.Element {
  return (
    <CommandPrimitive.Item
      className={cn(
        'relative flex min-h-touch cursor-default items-center gap-2 rounded-sm px-2 text-ui outline-none',
        'select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 md:min-h-row md:py-1',
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ className, ...props }: ComponentProps<'kbd'>): React.JSX.Element {
  return (
    <kbd
      className={cn('ml-auto font-code text-ui-sm tracking-wide text-muted-foreground', className)}
      {...props}
    />
  );
}
