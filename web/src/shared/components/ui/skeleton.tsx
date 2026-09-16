import type { HTMLAttributes } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The skeleton primitive, in the shadcn/ui shape. Generated territory — see `button.tsx`.
 *
 * A skeleton and not a centred spinner: it holds the shape of what is coming, so the page does not
 * jump when the content lands.
 */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn('animate-pulse rounded-lg bg-muted', className)} {...props} />;
}
