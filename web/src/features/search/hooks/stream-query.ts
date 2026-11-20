import { useQuery } from '@tanstack/react-query';
import type { QueryClient, QueryFunction, QueryKey } from '@tanstack/react-query';
import { skipToken } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { streamCutError } from '../services/search.service';
import type { SearchTruncation } from '../types/search';

/** One file-bearing stream's state, as a screen reads it — `useTextSearch` and `useReplacePreview` share this shape (B-13). */
export interface StreamState<TFile> {
  readonly files: readonly TFile[];
  readonly truncated: SearchTruncation;
  readonly skipped: number;
}

/** One line of either stream, in this feature's own vocabulary — what `searchText`/`previewReplace` both yield. */
export type StreamFrame<TFile> =
  | { readonly type: 'file'; readonly file: TFile }
  | { readonly type: 'end'; readonly truncated: SearchTruncation; readonly skipped: number }
  | { readonly type: 'error'; readonly error: AppError };

/** Where `file` belongs among `files`, sorted by path — the list never depends on arrival order. */
function insertSorted<TFile extends { readonly path: string }>(
  files: readonly TFile[],
  file: TFile,
): readonly TFile[] {
  const index = files.findIndex((existing) => existing.path > file.path);
  const at = index === -1 ? files.length : index;

  return [...files.slice(0, at), file, ...files.slice(at)];
}

/**
 * Drives one run of a stream, writing every file into the query cache as it closes (B-13) —
 * `useQuery`'s own `data` updates live, even though the query itself is still pending. Shared by
 * `useTextSearch` and `useReplacePreview`: the same accumulation, the same translated error for a
 * cut stream (S-170, S-171).
 */
export async function runStream<TFile extends { readonly path: string }>(
  frames: AsyncIterable<StreamFrame<TFile>>,
  key: QueryKey,
  client: QueryClient,
): Promise<StreamState<TFile>> {
  let files: readonly TFile[] = [];

  for await (const frame of frames) {
    if (frame.type === 'file') {
      files = insertSorted(files, frame.file);
      client.setQueryData<StreamState<TFile>>(key, { files, truncated: null, skipped: 0 });
    } else if (frame.type === 'end') {
      return { files, truncated: frame.truncated, skipped: frame.skipped };
    } else {
      throw frame.error;
    }
  }

  // The stream ended with no `end` or `error` line at all — a cut connection, this client's own
  // call, never a line the server actually sent (D-02).
  throw streamCutError();
}

/** The four states either stream hook returns, before it names its own `isSearching`/`isPreviewing`. */
export function useStream<TFile>(
  key: QueryKey,
  queryFn: QueryFunction<StreamState<TFile>> | typeof skipToken,
  enabled: boolean,
): StreamState<TFile> & {
  readonly isFetching: boolean;
  readonly error: AppError | null;
  reload(): void;
} {
  const query = useQuery<StreamState<TFile>, AppError>({
    queryKey: key,
    queryFn,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  return {
    files: query.data?.files ?? [],
    truncated: query.data?.truncated ?? null,
    skipped: query.data?.skipped ?? 0,
    // `isFetching`, never `isPending` — a file arriving calls `setQueryData` mid-stream (B-13),
    // which flips `isPending` to false the moment the first one lands, long before the stream
    // itself is done. `isFetching` stays true for exactly as long as the runner is still running.
    isFetching: enabled && query.isFetching,
    error: query.error,
    // Runs the same query again — a file changed since (B-15's own "search again", S-123), a
    // refusal the person wants to retry.
    reload: () => {
      void query.refetch();
    },
  };
}
