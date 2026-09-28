import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { AppError } from '@/shared/api/errors';
import { useLoad } from '@/shared/hooks/useLoad';

/** A promise the test settles by hand, so the order of the answers is the test's to choose. */
function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });

  return { promise, resolve, reject };
}

/**
 * A load whose first call is still in flight when the screen asks for a reload.
 *
 * @returns the two calls, in the order they were made, and the hook
 */
async function reloadedWhileLoading() {
  const first = deferred<string>();
  const second = deferred<string>();
  let calls = 0;
  const fetch = () => {
    calls += 1;
    return calls === 1 ? first.promise : second.promise;
  };

  const { result } = renderHook(() => useLoad(fetch));

  act(() => {
    result.current.reload();
  });
  await waitFor(() => {
    expect(calls).toBe(2);
  });

  return { first, second, result };
}

/**
 * The orderings a screen cannot be made to hold still for.
 *
 * Every screen that reads something goes through this hook, and each of them relies on the same
 * promise: an answer that arrives for a load nobody is waiting on any more is thrown away.
 */
describe('a load', () => {
  it('drops an answer that arrives after the screen went away', async () => {
    const answer = deferred<string>();
    const fetch = () => answer.promise;
    const { result, unmount } = renderHook(() => useLoad(fetch));

    unmount();

    await act(async () => {
      answer.resolve('late');
      await answer.promise;
    });

    // The last thing the screen rendered is still what it said while waiting.
    expect(result.current.load).toEqual({ status: 'loading' });
    expect(result.current.isLoading).toBe(true);
  });

  it('keeps the answer of the reload when the first load answers after it', async () => {
    // The first call is the slow one: the reload is asked and answers first, and then the stale
    // answer comes in. Letting it through is the slower answer winning.
    const { first, second, result } = await reloadedWhileLoading();

    await act(async () => {
      second.resolve('fresh');
      await second.promise;
    });
    expect(result.current.load).toEqual({ status: 'ready', value: 'fresh' });

    await act(async () => {
      first.resolve('stale');
      await first.promise;
    });

    expect(result.current.load).toEqual({ status: 'ready', value: 'fresh' });
  });

  it('ignores a failure of a load the reload already replaced', async () => {
    const { first, second, result } = await reloadedWhileLoading();

    await act(async () => {
      second.resolve('fresh');
      await second.promise;
    });

    await act(async () => {
      first.reject(new AppError('INTERNAL_ERROR', 'common.error.unexpected', 'trace-1'));
      await first.promise.catch(() => undefined);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.load).toEqual({ status: 'ready', value: 'fresh' });
  });
});
