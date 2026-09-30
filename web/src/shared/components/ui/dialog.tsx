import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef } from 'react';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The dialog primitive, in the shadcn/ui shape. Generated territory — see `button.tsx`.
 *
 * Radix holds the focus inside, closes on `Esc` and gives the focus back to whoever opened it: a
 * `<div role="dialog">` written by hand gets one of the three wrong (docs/architecture/web/03-ui-system.md).
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

// CUSTOM: no close icon in the corner. Every dialog of this product ends in buttons that say what
// they do, and an unlabelled "×" would be one more control a screen reader announces as "button".
// CUSTOM: the focus goes back to whoever had it when the dialog opened. Radix gives it to the
// `DialogTrigger`, and a dialog opened by a shortcut or from a state of the screen has none — the
// focus then lands on the page itself, and a keyboard user starts over from the top.
export function DialogContent({
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>): React.JSX.Element {
  const opener = useRef<HTMLElement | null>(null);

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl',
          '-translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border',
          'border-border bg-background p-6 shadow-lg',
          className,
        )}
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
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>): React.JSX.Element {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>): React.JSX.Element {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
