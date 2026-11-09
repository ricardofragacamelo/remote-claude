import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { usePagedList } from '@/shared/hooks/usePagedList';

const unexpected = {
  code: 'INTERNAL_ERROR',
  messageKey: 'common.error.unexpected',
  params: {},
  traceId: 'trace-1',
};

type Page = { items: readonly string[]; nextCursor: string | null };

const page = (items: readonly string[], nextCursor: string | null): Page => ({ items, nextCursor });

/** A promise the test resolves when it chooses — how a slow answer is modelled. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('the paged-list hook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loaded(key: string, fetchPage: (cursor: string | null) => Promise<Page>) {
    const hook = renderHook((props: { key: string }) => usePagedList(props.key, fetchPage), {
      initialProps: { key },
    });
    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });
    return hook;
  }

  it('starts loading, then holds the first page', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(['a', 'b'], null));

    const hook = renderHook(() => usePagedList('k', fetchPage));
    expect(hook.result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(hook.result.current.items).toEqual(['a', 'b']);
    });
    expect(hook.result.current.hasMore).toBe(false);
    expect(fetchPage).toHaveBeenCalledWith(null);
  });

  it('holds the failure instead of a page', async () => {
    const fetchPage = vi.fn().mockRejectedValue(unexpected);

    const hook = await loaded('k', fetchPage);

    expect(hook.result.current.error).toBe(unexpected);
    expect(hook.result.current.items).toEqual([]);
    expect(hook.result.current.hasMore).toBe(false);
  });

  it('appends the next page, from the cursor it was handed', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(['a', 'b'], 'c2'))
      .mockResolvedValueOnce(page(['c', 'd'], null));
    const hook = await loaded('k', fetchPage);

    act(() => {
      hook.result.current.loadMore();
    });
    await waitFor(() => {
      expect(hook.result.current.items).toEqual(['a', 'b', 'c', 'd']);
    });

    expect(fetchPage).toHaveBeenLastCalledWith('c2');
    expect(hook.result.current.hasMore).toBe(false);
  });

  it('asks for the next page once for two clicks inside the same frame', async () => {
    const next = deferred<Page>();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(['a'], 'c2'))
      .mockReturnValueOnce(next.promise);
    const hook = await loaded('k', fetchPage);

    act(() => {
      hook.result.current.loadMore();
      hook.result.current.loadMore();
    });
    expect(hook.result.current.isLoadingMore).toBe(true);

    await act(async () => {
      next.resolve(page(['b'], null));
      await next.promise;
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(hook.result.current.items).toEqual(['a', 'b']);
  });

  it('keeps what is on screen when the next page fails, and says why', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(['a'], 'c2'))
      .mockRejectedValueOnce(unexpected);
    const hook = await loaded('k', fetchPage);

    act(() => {
      hook.result.current.loadMore();
    });
    await waitFor(() => {
      expect(hook.result.current.moreError).toBe(unexpected);
    });

    expect(hook.result.current.items).toEqual(['a']);
    expect(hook.result.current.hasMore).toBe(true);
    expect(hook.result.current.isLoadingMore).toBe(false);
  });

  it('starts again from the top on a new key, dropping the old answer', async () => {
    const slow = deferred<Page>();
    const fetchPage = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(page(['b1'], null));
    const hook = renderHook((props: { key: string }) => usePagedList(props.key, fetchPage), {
      initialProps: { key: 'a' },
    });

    hook.rerender({ key: 'b' });
    await waitFor(() => {
      expect(hook.result.current.items).toEqual(['b1']);
    });

    await act(async () => {
      slow.resolve(page(['a1', 'a2'], 'c9'));
      await slow.promise;
    });

    expect(hook.result.current.items).toEqual(['b1']);
  });

  it('drops the failure of a first page whose key was replaced', async () => {
    const slow = deferred<Page>();
    const fetchPage = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(page(['b1'], null));
    const hook = renderHook((props: { key: string }) => usePagedList(props.key, fetchPage), {
      initialProps: { key: 'a' },
    });

    hook.rerender({ key: 'b' });
    await waitFor(() => {
      expect(hook.result.current.items).toEqual(['b1']);
    });
    await act(async () => {
      slow.reject(unexpected);
      await slow.promise.catch(() => undefined);
    });

    expect(hook.result.current.error).toBeNull();
  });

  it('does not reload for a render with the same key', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(['a'], null));
    const hook = await loaded('k', fetchPage);

    hook.rerender({ key: 'k' });

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('loads again from the top on a reload', async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(unexpected)
      .mockResolvedValueOnce(page(['a'], null));
    const hook = await loaded('k', fetchPage);

    act(() => {
      hook.result.current.reload();
    });
    expect(hook.result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(hook.result.current.items).toEqual(['a']);
    });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('asks for nothing more when there is nothing more', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(['a'], null));
    const hook = await loaded('k', fetchPage);

    act(() => {
      hook.result.current.loadMore();
    });

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing more while the first page is still loading', () => {
    const fetchPage = vi.fn().mockReturnValue(new Promise(() => undefined));
    const hook = renderHook(() => usePagedList('k', fetchPage));

    act(() => {
      hook.result.current.loadMore();
    });

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('drops a next page that arrives after the key changed', async () => {
    const more = deferred<Page>();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(['a2'], 'c2'))
      .mockReturnValueOnce(more.promise)
      .mockResolvedValueOnce(page(['b1'], null));
    const hook = await loaded('a', fetchPage);

    act(() => {
      hook.result.current.loadMore();
    });
    hook.rerender({ key: 'b' });
    await waitFor(() => {
      expect(hook.result.current.items).toEqual(['b1']);
    });

    await act(async () => {
      more.resolve(page(['a1'], null));
      await more.promise;
    });

    expect(hook.result.current.items).toEqual(['b1']);
  });

  it('drops a next-page failure that arrives after the key changed', async () => {
    const more = deferred<Page>();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(['a2'], 'c2'))
      .mockReturnValueOnce(more.promise)
      .mockResolvedValueOnce(page(['b1'], null));
    const hook = await loaded('a', fetchPage);

    act(() => {
      hook.result.current.loadMore();
    });
    hook.rerender({ key: 'b' });
    await waitFor(() => {
      expect(hook.result.current.items).toEqual(['b1']);
    });

    await act(async () => {
      more.reject(unexpected);
      await more.promise.catch(() => undefined);
    });

    expect(hook.result.current.moreError).toBeNull();
    expect(hook.result.current.items).toEqual(['b1']);
  });

  it('resets the in-flight guard from the newer request, not an abandoned older one for the same key — concurrency', async () => {
    const oldMore = deferred<Page>();
    const newMore = deferred<Page>();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(['a1'], 'c2')) // initial page for key 'a'
      .mockReturnValueOnce(oldMore.promise) // first load-more for key 'a', abandoned
      .mockResolvedValueOnce(page(['b1'], 'c3')) // initial page for key 'b'
      .mockReturnValueOnce(newMore.promise); // load-more for key 'b'
    const hook = renderHook((props: { key: string }) => usePagedList(props.key, fetchPage), {
      initialProps: { key: 'a' },
    });
    await waitFor(() => {
      expect(hook.result.current.items).toEqual(['a1']);
    });

    act(() => {
      hook.result.current.loadMore();
    });

    hook.rerender({ key: 'b' });
    await waitFor(() => {
      expect(hook.result.current.items).toEqual(['b1']);
    });

    act(() => {
      hook.result.current.loadMore();
    });
    expect(hook.result.current.isLoadingMore).toBe(true);

    // The abandoned 'a' load-more settles after the 'b' one already started: its own cleanup
    // must not clear the guard the 'b' request still holds.
    await act(async () => {
      oldMore.resolve(page(['a2'], null));
      await oldMore.promise;
    });
    expect(hook.result.current.isLoadingMore).toBe(true);

    await act(async () => {
      newMore.resolve(page(['b2'], null));
      await newMore.promise;
    });
    expect(hook.result.current.items).toEqual(['b1', 'b2']);
    expect(hook.result.current.isLoadingMore).toBe(false);
  });

  it('ignores a stale load-more answer even when the key cycles back to one it already used — concurrency', async () => {
    const abandonedMore = deferred<Page>();
    const secondA = deferred<Page>();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(['a1'], 'c2')) // first lifecycle of key 'a'
      .mockReturnValueOnce(abandonedMore.promise) // load-more for the first 'a' lifecycle
      .mockResolvedValueOnce(page(['b1'], null)) // key 'b'
      .mockReturnValueOnce(secondA.promise); // second lifecycle of key 'a', still pending
    const hook = renderHook((props: { key: string }) => usePagedList(props.key, fetchPage), {
      initialProps: { key: 'a' },
    });
    await waitFor(() => {
      expect(hook.result.current.items).toEqual(['a1']);
    });

    act(() => {
      hook.result.current.loadMore();
    });

    hook.rerender({ key: 'b' });
    await waitFor(() => {
      expect(hook.result.current.items).toEqual(['b1']);
    });

    // Back to 'a': the query string this produces is identical to the first 'a' lifecycle's,
    // since neither a key's own value nor the attempt counter ever repeats elsewhere — only the
    // round trip back to the same key does. Its fetch is left pending on purpose.
    hook.rerender({ key: 'a' });
    expect(hook.result.current.isLoading).toBe(true);

    // The abandoned load-more from the FIRST 'a' lifecycle now answers. Its query string matches
    // the current one again, so the early-return guard alone cannot protect the page in memory,
    // which still belongs to 'b' while the second 'a' fetch is in flight.
    await act(async () => {
      abandonedMore.resolve(page(['a2'], null));
      await abandonedMore.promise;
    });
    expect(hook.result.current.isLoading).toBe(true);

    await act(async () => {
      secondA.resolve(page(['a1-again'], null));
      await secondA.promise;
    });
    expect(hook.result.current.items).toEqual(['a1-again']);
  });

  it('replaces the items on screen from an answer already in hand, without asking the server', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(['a', 'b'], null));
    const hook = await loaded('k', fetchPage);
    fetchPage.mockClear();

    act(() => {
      hook.result.current.setItems((current) => current.filter((item) => item !== 'a'));
    });

    expect(hook.result.current.items).toEqual(['b']);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('ignores setItems before the first page has arrived', () => {
    const fetchPage = vi.fn().mockReturnValue(new Promise(() => undefined));
    const hook = renderHook(() => usePagedList('k', fetchPage));

    act(() => {
      hook.result.current.setItems(() => ['x']);
    });

    expect(hook.result.current.items).toEqual([]);
  });
});
