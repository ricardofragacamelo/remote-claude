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
  // CUSTOM: a `status` role, so the label every skeleton here carries ("Opening the folder…") is
  // allowed on it and announced: a label on a `div` with no role is refused by the ARIA rules.
  return (
    <div role="status" className={cn('animate-pulse rounded-lg bg-muted', className)} {...props} />
  );
}
