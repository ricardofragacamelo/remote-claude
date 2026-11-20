import { useMutation } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { applyReplace } from '../services/search.service';
import type { ReplaceApplyFileRequest, ReplaceApplyReport, ReplaceQuery } from '../types/search';

/** What one apply asks: the query that found the matches, and which files to write them into. */
export interface ApplyReplaceRequest {
  readonly query: ReplaceQuery;
  readonly files: readonly ReplaceApplyFileRequest[];
}

/** Applying the replace (plan 11, B-11, B-16) — never optimistic: the report says what happened. */
export interface ApplyReplace {
  apply(request: ApplyReplaceRequest): Promise<ReplaceApplyReport>;
  readonly isApplying: boolean;
  readonly error: AppError | null;
  readonly report: ReplaceApplyReport | undefined;
  reset(): void;
}

/**
 * Applies a replace across the files a preview named — `changed`/`missing`/`skipped` are not
 * failures of the request, they are the report (D-05); only a real refusal (a malformed query, no
 * ETag at all, too many files) rejects {@link ApplyReplace.apply} itself.
 *
 * @param folder the tab's own folder
 */
export function useApplyReplace(folder: string): ApplyReplace {
  const mutation = useMutation<ReplaceApplyReport, AppError, ApplyReplaceRequest>({
    mutationFn: ({ query, files }) => applyReplace(folder, query, files),
  });

  return {
    apply: (request) => mutation.mutateAsync(request),
    isApplying: mutation.isPending,
    error: mutation.error,
    report: mutation.data,
    reset: () => {
      mutation.reset();
    },
  };
}
