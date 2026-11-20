import { useState } from 'react';

/**
 * `files`, kept through the next request's own refusal (S-114) — shared by the search and the
 * replace preview (B-16), which both retain their last successful result the same way: a new
 * request starts its own, empty state, so retaining needs a snapshot outside any one request's
 * cache entry.
 *
 * Adjusted during render — React's own documented pattern for "remember something from a previous
 * render" — never an effect: `files` is a fresh `[]` every render while there is nothing to show
 * (`useStream`'s own fallback), and an effect conditioned on it would fire forever.
 *
 * @param hasRequest whether a request is in flight or settled right now — `false` clears the
 *   retained files, since there is nothing left to keep them beside
 * @param hasError whether the current request's own answer is a refusal — only then does an empty
 *   `files` fall back to what was retained, rather than being shown as a legitimate empty result
 */
export function useRetainedOnRefusal<F>(
  files: readonly F[],
  hasRequest: boolean,
  hasError: boolean,
): readonly F[] {
  const [retained, setRetained] = useState<readonly F[]>([]);

  if (files.length > 0 && files !== retained) {
    setRetained(files);
  } else if (!hasRequest && retained.length > 0) {
    setRetained([]);
  }

  return files.length > 0 || !hasError ? files : retained;
}
