import { useEffect, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import type { Load } from './useLoad';

/** `Load`, plus `idle` before the caller has given this read anything worth asking about — the
 * one state `useLoad` (always-on-mount) never needs and so never has. */
export type AsyncRead<T> = Load<T> | { readonly status: 'idle' };

/**
 * Fetches `input` through `fetch` whenever it changes, by its own JSON key — `null` means nothing
 * to ask yet, and the read stays `idle`. Dropped if it unmounted or `input` moved on first. The
 * rule-authoring wizard's own live preview and its simulation read share this shape (plan 15,
 * B-27) — never fetching on a mount alone, the way every other read in this product does.
 */
export function useAsyncRead<Input, T>(
  input: Input | null,
  fetch: (input: Input) => Promise<T>,
): AsyncRead<T> {
  const key = input === null ? null : JSON.stringify(input);

  // Keyed by the `key` it settled for — never reset to "loading" by the effect itself, which
  // would mean calling `setState` synchronously in its own body. Read against the current `key`
  // below instead: a stale result (the wrong key) is exactly what "still loading" looks like.
  const [settled, setSettled] = useState<{
    readonly key: string;
    readonly read: AsyncRead<T>;
  } | null>(null);

  useEffect(() => {
    if (key === null) {
      return undefined;
    }

    let cancelled = false;

    void fetch(JSON.parse(key) as Input)
      .then((value) => {
        if (!cancelled) {
          setSettled({ key, read: { status: 'ready', value } });
        }
      })
      .catch((error: AppError) => {
        if (!cancelled) {
          setSettled({ key, read: { status: 'failed', error } });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fetch` is keyed by `input` already, the same reasoning `usePagedList` documents for its own `fetchPage`
  }, [key]);

  if (key === null) {
    return { status: 'idle' };
  }

  return settled !== null && settled.key === key ? settled.read : { status: 'loading' };
}
