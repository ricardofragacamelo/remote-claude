import type { UseQueryResult } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';

/** Where a read of the screen stands: loading, failed with why, and how to try again. */
export interface ReadState {
  readonly isLoading: boolean;
  readonly error: AppError | null;
  retry(): void;
}

/** The state of one query, as every section of the screen shows it. */
export function readStateOf(query: UseQueryResult<unknown, AppError>): ReadState {
  return {
    isLoading: query.isPending,
    error: query.error,
    retry: () => {
      void query.refetch();
    },
  };
}
