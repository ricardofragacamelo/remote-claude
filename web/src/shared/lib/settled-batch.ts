import type { AppError } from '@/shared/api/errors';

/** What a batch write names one row by — enough to run the request and to report the outcome. */
export interface BatchTarget {
  readonly id: string;
  readonly name: string;
}

/** One item of a batch answer — a write run on more than one row at once: a row refused does not
 * stop the others, and the screen says which failed and why (S-134). */
export interface BatchItemResult extends BatchTarget {
  readonly ok: boolean;
  readonly error?: AppError;
}

/**
 * Runs [run] once per item of [items], never stopping at the first failure — each outcome settled
 * on its own and reported on its own row (S-134). Shared by `mcp`'s own `useMcpServerMutations` and
 * an engine extension's own `usePluginMutations` (plan 13, B-28, B-29), rather than each hand-copying
 * the same `Promise.allSettled` wiring.
 */
export async function settledBatch<T extends BatchTarget>(
  items: readonly T[],
  run: (item: T) => Promise<unknown>,
  errorOf: (reason: unknown) => AppError,
): Promise<readonly BatchItemResult[]> {
  const outcomes = await Promise.allSettled(items.map((item) => run(item)));
  // `outcomes` has exactly one entry per item of `items`, in the same order — `items[index]`
  // always exists, so there is no fallback branch here to leave untested.
  return outcomes.map((outcome, index) => {
    const item = items[index]!;
    return outcome.status === 'fulfilled'
      ? { ...item, ok: true }
      : { ...item, ok: false, error: errorOf(outcome.reason) };
  });
}
