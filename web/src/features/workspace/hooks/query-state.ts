import type { UseQueryResult } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';

/** The three things every read of this feature hands a screen besides its data. */
export interface QueryState {
  readonly isLoading: boolean;
  readonly error: AppError | null;
  reload(): void;
}

/**
 * A query, as the screens of this feature read it: loading until the first answer, the refusal
 * when there is one, and a way to ask again.
 */
export function stateOf(query: UseQueryResult<unknown, AppError>): QueryState {
  return {
    isLoading: query.isPending,
    error: query.error,
    reload: () => {
      void query.refetch();
    },
  };
}
