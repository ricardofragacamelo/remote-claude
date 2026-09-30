import { Toaster as Sonner } from 'sonner';
import type { ComponentProps } from 'react';

/**
 * The toaster primitive, in the shadcn/ui shape. Generated territory — see `button.tsx`.
 *
 * `sonner` stacks the toasts in a polite live region, pauses them while hovered or focused, and
 * never takes the focus: a toast is told, not asked.
 */
// CUSTOM: the theme comes from the caller, not from `next-themes` — this app keeps its own
// (docs/architecture/web/03-ui-system.md#tema).
export function Toaster(props: ComponentProps<typeof Sonner>): React.JSX.Element {
  return <Sonner className="toaster group" {...props} />;
}
