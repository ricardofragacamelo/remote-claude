import type { UseQueryResult } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';

/** A read of the server, as a screen draws it: the answer, loading, or why it failed. */
export interface Loaded<T> {
  readonly data: T | null;
  readonly isLoading: boolean;
  readonly error: AppError | null;
  retry(): void;
}

/** A query, in the shape a screen draws — the four states and the way to try again. */
export function loadedOf<T>(query: UseQueryResult<T, AppError>): Loaded<T> {
  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    retry: () => {
      void query.refetch();
    },
  };
}

/**
 * A query read only when a row is unfolded, in the same shape: loading only while there is nothing
 * yet to show, and a failure only while there is no answer — a failed refetch keeps what came.
 */
export function unfoldedOf<T>(query: UseQueryResult<T, AppError>): Loaded<T> {
  return {
    data: query.data ?? null,
    isLoading: query.isFetching && query.data === undefined,
    error: query.data === undefined ? query.error : null,
    retry: () => {
      void query.refetch();
    },
  };
}
