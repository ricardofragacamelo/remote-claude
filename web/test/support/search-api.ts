import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import type {
  SearchLocatePayload,
  SearchReplaceApplyResultPayload,
  SearchReplacePreviewFramePayload,
  SearchTextFramePayload,
} from '@remote-claude/contracts';

/** A refusal as `api.ts` hands it over. */
export function refusal(code: string, messageKey: string, params = {}): AppError {
  return new AppError(code, messageKey, 'trace-1', params);
}

/**
 * What one `ndjson` call answers: its frames in order, a refusal thrown before the first byte, or
 * a stream the test keeps open by hand (see {@link pendingStream}) — for a request still running
 * when the next one supersedes it.
 */
export type StreamAnswer<T> = readonly T[] | AppError | AsyncIterable<T>;

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
}

async function* framesOf<T>(answer: StreamAnswer<T>): AsyncGenerator<T> {
  if (answer instanceof AppError) {
    throw answer;
  }
  if (isAsyncIterable<T>(answer)) {
    yield* answer;
    return;
  }
  for (const frame of answer) {
    yield frame;
  }
}

/** A stream the test feeds frame by frame, open until {@link finish} — for S-62-style cancel tests. */
export function pendingStream<T>(): {
  readonly iterable: AsyncIterable<T>;
  push(frame: T): void;
  finish(): void;
} {
  const queue: T[] = [];
  let resolveNext: ((result: IteratorResult<T>) => void) | null = null;
  let closed = false;

  return {
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<T>> {
            if (queue.length > 0) {
              return Promise.resolve({ value: queue.shift() as T, done: false });
            }
            if (closed) {
              return Promise.resolve({ value: undefined, done: true });
            }
            return new Promise((resolve) => {
              resolveNext = resolve;
            });
          },
        };
      },
    },
    push(frame) {
      if (resolveNext !== null) {
        resolveNext({ value: frame, done: false });
        resolveNext = null;
      } else {
        queue.push(frame);
      }
    },
    finish() {
      closed = true;
      if (resolveNext !== null) {
        resolveNext({ value: undefined, done: true });
        resolveNext = null;
      }
    },
  };
}

/** A locate answer a test gives, `skipped` defaulted to 0 when left out — S-63 is backend-only. */
export type LocateAnswer =
  (Omit<SearchLocatePayload, 'skipped'> & { readonly skipped?: number }) | AppError;

/** The routes of the `search` module, each answered as the test says. Absent means "never". */
export interface SearchRoutes {
  locate?: (asked: URLSearchParams) => LocateAnswer;
  text?: (body: Record<string, unknown>) => StreamAnswer<SearchTextFramePayload>;
  replacePreview?: (
    body: Record<string, unknown>,
  ) => StreamAnswer<SearchReplacePreviewFramePayload>;
  apply?: (body: Record<string, unknown>) => SearchReplaceApplyResultPayload | AppError;
}

/** A request nobody answers: the hook stays loading. */
function never<T>(): Promise<T> {
  return new Promise(() => undefined);
}

/**
 * Stands the backend's `search` routes in for the one HTTP client, route by route — mocking
 * `api.get`/`api.ndjson`/`api.post` directly, never the service layer, so each hook test also
 * exercises `search.service.ts`'s own frame mapping for free (same convention as
 * `fakeWorkspaceApi`).
 *
 * @returns the spies, and the signals each stream call was given, keyed by the request's `folder`
 */
export function fakeSearchApi(routes: SearchRoutes) {
  const signals = new Map<string, AbortSignal>();

  const get = vi.spyOn(api, 'get').mockImplementation((path: string) => {
    const [route, search] = path.split('?');
    if (route !== '/search/files') return never();
    const asked = new URLSearchParams(search ?? '');
    if (routes.locate === undefined) return never();
    const answer = routes.locate(asked);
    return answer instanceof AppError
      ? Promise.reject(answer)
      : Promise.resolve({ skipped: 0, ...answer });
  });

  const ndjson = vi
    .spyOn(api, 'ndjson')
    .mockImplementation((path: string, body: unknown, options?: { signal?: AbortSignal }) => {
      const asked = body as Record<string, unknown>;
      if (options?.signal !== undefined) signals.set(String(asked['folder']), options.signal);

      if (path === '/search/text') {
        return routes.text === undefined ? (never() as never) : framesOf(routes.text(asked));
      }
      if (path === '/search/replace/preview') {
        return routes.replacePreview === undefined
          ? (never() as never)
          : framesOf(routes.replacePreview(asked));
      }
      return never() as never;
    });

  const post = vi.spyOn(api, 'post').mockImplementation((path: string, body: unknown) => {
    if (path !== '/search/replace' || routes.apply === undefined) return never();
    const answer = routes.apply(body as Record<string, unknown>);
    return answer instanceof AppError ? Promise.reject(answer) : Promise.resolve(answer);
  });

  return { get, ndjson, post, signals };
}
