import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { useRef } from 'react';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The sheet primitive, in the shadcn/ui shape: a dialog that slides in from an edge. Generated
 * territory — see `button.tsx`.
 *
 * A dialog underneath, so the focus is held inside, `Esc` closes it and the focus goes back to the
 * trigger — the menu of the navigation under `md` leans on all three (plan 06, S-92).
 */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

const sheet = cva(
  'fixed z-50 flex flex-col gap-4 overflow-y-auto border-border bg-background p-4 shadow-lg',
  {
    variants: {
      side: {
        left: 'inset-y-0 left-0 h-full w-4/5 max-w-sm border-r',
        right: 'inset-y-0 right-0 h-full w-4/5 max-w-md border-l',
        bottom: 'inset-x-0 bottom-0 max-h-[85dvh] border-t',
      },
    },
    defaultVariants: { side: 'right' },
  },
);

// CUSTOM: no close icon in the corner, as in `dialog.tsx`: every sheet here says how to leave it in
// words, and `Esc` always does.
// CUSTOM: the focus goes back to whoever had it when the sheet opened, as in `dialog.tsx`: a sheet
// opened from a state of the screen — the menu of the navigation — has no `SheetTrigger` for Radix to
// give it back to (plan 06, S-92).
export function SheetContent({
  className,
  side,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & VariantProps<typeof sheet>): React.JSX.Element {
  const opener = useRef<HTMLElement | null>(null);

  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80" />
      <SheetPrimitive.Content
        className={cn(sheet({ side }), className)}
        onOpenAutoFocus={(event) => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (!event.defaultPrevented && opener.current?.isConnected === true) {
            event.preventDefault();
            opener.current.focus();
          }
        }}
        {...props}
      />
    </SheetPrimitive.Portal>
  );
}

export function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Title>): React.JSX.Element {
  return <SheetPrimitive.Title className={cn('text-ui font-ui-strong', className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>): React.JSX.Element {
  return (
    <SheetPrimitive.Description
      className={cn('text-ui-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
