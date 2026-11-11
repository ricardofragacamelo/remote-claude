import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useAsyncRead } from '@/shared/hooks/useAsyncRead';

const unexpected = { code: 'INTERNAL', messageKey: 'common.error.unexpected', params: {} };

/** A promise the test resolves when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('useAsyncRead — a read nobody always wants (plan 15, B-27)', () => {
  it('stays idle, and never calls fetch, while input is null', () => {
    const fetch = vi.fn();
    const { result } = renderHook(() => useAsyncRead<{ a: number }, string>(null, fetch));

    expect(result.current).toEqual({ status: 'idle' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads, then reads, the value fetch resolves with', async () => {
    const work = deferred<string>();
    const fetch = vi.fn().mockReturnValue(work.promise);
    const { result } = renderHook(() => useAsyncRead({ a: 1 }, fetch));

    expect(result.current).toEqual({ status: 'loading' });

    work.resolve('ready');

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', value: 'ready' });
    });
    expect(fetch).toHaveBeenCalledWith({ a: 1 });
  });

  it('reads the error a rejected fetch carries', async () => {
    const fetch = vi.fn().mockRejectedValue(unexpected);
    const { result } = renderHook(() => useAsyncRead({ a: 1 }, fetch));

    await waitFor(() => {
      expect(result.current).toEqual({ status: 'failed', error: unexpected });
    });
  });

  it('refetches when input changes, by its own JSON shape', async () => {
    const fetch = vi.fn().mockResolvedValue('ready');
    const { result, rerender } = renderHook(({ input }) => useAsyncRead(input, fetch), {
      initialProps: { input: { a: 1 } as { a: number } | null },
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    rerender({ input: { a: 1 } });
    expect(fetch).toHaveBeenCalledTimes(1);

    rerender({ input: { a: 2 } });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    rerender({ input: null });
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('drops a stale rejection — input moved on before the failed fetch settled', async () => {
    const first = deferred<string>();
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce('second');
    const { result, rerender } = renderHook(({ input }) => useAsyncRead(input, fetch), {
      initialProps: { input: { a: 1 } },
    });

    rerender({ input: { a: 2 } });
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', value: 'second' });
    });

    first.reject(unexpected);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current).toEqual({ status: 'ready', value: 'second' });
  });

  it('drops a stale answer — input moved on before fetch settled', async () => {
    const first = deferred<string>();
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce('second');
    const { result, rerender } = renderHook(({ input }) => useAsyncRead(input, fetch), {
      initialProps: { input: { a: 1 } },
    });

    rerender({ input: { a: 2 } });
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', value: 'second' });
    });

    first.resolve('first');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current).toEqual({ status: 'ready', value: 'second' });
  });
});
