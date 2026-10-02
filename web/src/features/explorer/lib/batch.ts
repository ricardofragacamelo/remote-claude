import { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';
import type { ExplorerError } from '../types/explorer';
import { isWithin } from './paths';

/** How one item of an operation went: done, or not, and why (S-182). */
export type ItemResult =
  | {
      readonly path: string;
      readonly ok: true;

      /** What is worth saying of an item that went, besides "done" — a translation key. */
      readonly noteKey?: string;
    }
  | { readonly path: string; readonly ok: false; readonly error: ExplorerError };

/** A failure as the screen shows it — anything that is not the server's answer is "unexpected". */
export function asExplorerError(error: unknown): ExplorerError {
  if (error instanceof AppError) {
    return error;
  }

  logger.warn(
    { op: 'explorer.operation', err: String(error) },
    'file operation failed unexpectedly',
  );
  return new AppError('INTERNAL_ERROR', 'common.error.unexpected', 'local');
}

/**
 * Acts on each item in turn — one after the other, so two requests never race in the same folder —
 * and answers how each went. One failure does not stop the others: the person reads what went, what
 * did not, and why.
 *
 * @param subject the path the person knows the item by
 */
export async function runEach<T>(
  items: readonly T[],
  subject: (item: T) => string,
  act: (item: T) => Promise<void>,
): Promise<readonly ItemResult[]> {
  const results: ItemResult[] = [];

  for (const item of items) {
    try {
      await act(item);
      results.push({ path: subject(item), ok: true });
    } catch (error) {
      results.push({ path: subject(item), ok: false, error: asExplorerError(error) });
    }
  }

  return results;
}

/**
 * Whether a destination is one of the entries going there, or inside one — a batch that cannot be
 * done, refused whole before anything is sent (S-183).
 */
export function intoItself(paths: readonly string[], destination: string): boolean {
  return paths.some((path) => isWithin(destination, path));
}
