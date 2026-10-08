import { useCallback, useEffect, useState } from 'react';

import type { AppError } from '@/shared/api/errors';

/** Bytes as a `blob:` URL the page made itself — or why there is none. */
export interface ObjectUrl {
  readonly url: string | null;
  readonly error: AppError | null;
  retry(): void;
}

/** Where the bytes come from, and what a failure to read them says. */
export interface ObjectSource {
  read(signal: AbortSignal): Promise<Blob>;
  failure(error: unknown): AppError;
}

/** What a read gave, and which read it was — the answer to an older one is not on screen. */
interface Made {
  readonly key: string;
  readonly url: string | null;
  readonly error: AppError | null;
}

/**
 * Bytes fetched with the credential in the header and turned into a `blob:` URL — what an `<img>`
 * shows when no token may go in any URL (07 · D-16, 22 · D-10). The URL is revoked when the view
 * goes or the read changes, and a read still on its way is aborted.
 *
 * @param parts what is read; a change, or a retry, is another read
 * @param source the read, or `null` while there is nothing to read. It has to be **stable** across
 *   renders (memoised by the caller), like `useLoad`'s fetch
 */
export function useObjectUrl(parts: readonly string[], source: ObjectSource | null): ObjectUrl {
  const [made, setMade] = useState<Made | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = [...parts, String(attempt)].join('\n');
  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  useEffect(() => {
    if (source === null) {
      return undefined;
    }

    const controller = new AbortController();
    let url: string | null = null;

    source.read(controller.signal).then(
      (blob) => {
        if (!controller.signal.aborted) {
          url = URL.createObjectURL(blob);
          setMade({ key, url, error: null });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setMade({ key, url: null, error: source.failure(error) });
        }
      },
    );

    return () => {
      controller.abort();

      if (url !== null) {
        URL.revokeObjectURL(url);
        // A revoked URL shows nothing: read again, the view waits for the new read instead.
        setMade((now) => (now?.url === url ? null : now));
      }
    };
  }, [key, source]);

  const current = made?.key === key ? made : null;

  return { url: current?.url ?? null, error: current?.error ?? null, retry };
}
