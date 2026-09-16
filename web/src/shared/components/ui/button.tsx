import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * The button primitive, in the shadcn/ui shape.
 *
 * This folder is generated territory: it is owned by the generator, and a change made here needs a
 * `// CUSTOM:` comment or the next regeneration silently removes it.
 *
 * Variants come from CVA and never from an `if` over class names — see
 * docs/architecture/web/03-ui-system.md. Every colour is a role token, never a literal shade.
 */
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium ' +
    'transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:opacity-90',
        outline: 'border border-border bg-transparent hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        // 44px, the minimum comfortable touch target — the web runs on phones too.
        touch: 'h-11 px-5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: ButtonProps): React.JSX.Element {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
