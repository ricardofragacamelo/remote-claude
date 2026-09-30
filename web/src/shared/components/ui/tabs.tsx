import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The tabs primitive, in the shadcn/ui shape. Generated territory — see `button.tsx`.
 *
 * The WAI-ARIA tabs pattern: one tab stop, the arrows move between tabs, and each panel is labelled
 * by its tab.
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>): React.JSX.Element {
  return (
    <TabsPrimitive.List
      className={cn('flex h-header shrink-0 items-stretch gap-1 border-b border-border', className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>): React.JSX.Element {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'flex min-h-touch items-center px-3 text-ui-sm tracking-wide text-muted-foreground uppercase',
        'border-b-2 border-transparent md:min-h-0',
        'data-[state=active]:border-primary data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>): React.JSX.Element {
  return <TabsPrimitive.Content className={cn('min-h-0 flex-1', className)} {...props} />;
}
