import { useCallback, useEffect, useState } from 'react';

import type { AppError } from '@/shared/api/errors';

/**
 * Where one load is.
 *
 * One value rather than three booleans kept in step with each other: "loading and also holding an
 * error" is a state this cannot express, and it is the state a screen eventually renders when the
 * flags are separate.
 */
export type Load<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'failed'; readonly error: AppError };

/** What a screen needs from a load, plus the two ways to move it. */
export interface Loaded<T> {
  readonly load: Load<T>;
  readonly isLoading: boolean;
  readonly error: AppError | null;

  /** Replaces what is on screen without going back to the network — a row that just changed. */
  setLoad(next: (current: Load<T>) => Load<T>): void;

  reload(): void;
}

/**
 * Fetch once, and again on demand.
 *
 * Every screen of this product that reads something does the same four things — start loading,
 * drop the result if it unmounted first, keep the failure **instead of** the stale value, and
 * offer a retry — and doing them once is what keeps two screens from disagreeing about what
 * "loading" means. The four states themselves are normative
 * (docs/architecture/web/03-ui-system.md).
 *
 * The value goes with the error rather than staying beside it: leaving the previous one on screen
 * says it is still true, and the next click would act on something that is not.
 *
 * `reload` bumps an attempt counter rather than calling the service itself. Calling it directly
 * would race the load already in flight, and the slower answer would win.
 *
 * @param fetch what to call. It has to be **stable** across renders — a module-level function, or
 *   one the caller memoised. An inline lambda is a new value on every render, and the dependency
 *   it sits in would then reload on every one of them.
 */
export function useLoad<T>(fetch: () => Promise<T>): Loaded<T> {
  const [load, setLoad] = useState<Load<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void fetch()
      .then((value) => {
        if (!cancelled) {
          setLoad({ status: 'ready', value });
        }
      })
      .catch((error: AppError) => {
        if (!cancelled) {
          setLoad({ status: 'failed', error });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, fetch]);

  const reload = useCallback(() => {
    setLoad({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);

  return {
    load,
    isLoading: load.status === 'loading',
    error: load.status === 'failed' ? load.error : null,
    setLoad,
    reload,
  };
}
