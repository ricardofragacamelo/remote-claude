import * as ResizablePrimitive from 'react-resizable-panels';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The resizable primitive, in the shadcn/ui shape, over `react-resizable-panels`. Generated
 * territory — see `button.tsx`.
 *
 * The handle is a real separator: focusable, moved by the arrow keys, announced with its value —
 * resizing with a mouse alone would leave a keyboard user with the layout somebody else chose.
 */
export function ResizablePanelGroup({
  className,
  ...props
}: ComponentProps<typeof ResizablePrimitive.Group>): React.JSX.Element {
  return (
    <ResizablePrimitive.Group
      className={cn('flex h-full w-full aria-[orientation=vertical]:flex-col', className)}
      {...props}
    />
  );
}

export const ResizablePanel = ResizablePrimitive.Panel;

export function ResizableHandle({
  className,
  ...props
}: ComponentProps<typeof ResizablePrimitive.Separator>): React.JSX.Element {
  return (
    <ResizablePrimitive.Separator
      className={cn(
        'relative flex w-px items-center justify-center bg-border',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2',
        'focus-visible:bg-ring data-[separator=hover]:bg-ring data-[separator=active]:bg-ring',
        'aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full',
        className,
      )}
      {...props}
    />
  );
}
