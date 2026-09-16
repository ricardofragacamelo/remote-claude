import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional class names, with Tailwind conflicts resolved.
 *
 * `cn('p-2', 'p-4')` is `p-4`, which is what a reader expects. Joining strings by hand produces a
 * style bug that only appears for one combination of props, and only in production.
 */
export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}
