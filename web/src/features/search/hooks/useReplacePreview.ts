import { skipToken, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryFunction, QueryKey } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { previewReplace } from '../services/search.service';
import type { ReplacePreviewFileResult, ReplacePreviewState, ReplaceQuery } from '../types/search';
import { searchKeys } from './search-keys';
import { runStream, useStream } from './stream-query';

/** The replace preview, as a screen reads it — still arriving, or settled, nothing lost either way. */
export interface ReplacePreview extends ReplacePreviewState {
  readonly isPreviewing: boolean;
  readonly error: AppError | null;
  reload(): void;
}

/** The query key and the runner for one ask — `skipToken` for "nothing to preview yet" (B-13). */
function replacePreviewQueryOf(
  folder: string | null,
  request: ReplaceQuery | null,
  client: QueryClient,
): {
  readonly key: QueryKey;
  readonly queryFn: QueryFunction<ReplacePreviewState> | typeof skipToken;
} {
  if (folder === null || request === null) {
    return { key: [...searchKeys.all, 'replace-preview'], queryFn: skipToken };
  }

  const key = searchKeys.replacePreview(folder, request);
  return {
    key,
    queryFn: ({ signal }) => runStream(previewReplace(folder, request, signal), key, client),
  };
}

/**
 * The replace preview (plan 11, B-11, B-16) — the same stream shape as {@link useTextSearch},
 * with the ETag of each file alongside its matches, needed to apply later.
 *
 * @param folder the tab's own folder, or `null` while there is none to preview
 * @param request `null` while there is nothing to preview yet
 */
export function useReplacePreview(
  folder: string | null,
  request: ReplaceQuery | null,
): ReplacePreview {
  const client = useQueryClient();
  const { key, queryFn } = replacePreviewQueryOf(folder, request, client);
  const { isFetching, ...state } = useStream<ReplacePreviewFileResult>(
    key,
    queryFn,
    folder !== null && request !== null,
  );

  return { ...state, isPreviewing: isFetching };
}
