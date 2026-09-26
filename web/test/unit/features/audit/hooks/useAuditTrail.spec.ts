import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useAuditTrail } from '@/features/audit/hooks/useAuditTrail';
import type { AuditFilters } from '@/features/audit';
import * as service from '@/features/audit/services/audit.service';

const unexpected = {
  code: 'INTERNAL_ERROR',
  messageKey: 'common.error.unexpected',
  params: {},
  traceId: 'trace-1',
};

function anEntry(id: string): Record<string, unknown> {
  return {
    id,
    sessionId: 'S1',
    toolUseId: null,
    toolName: 'Bash',
    input: {},
    decision: 'recorded',
    at: '2026-09-24T12:00:00.000Z',
    traceId: null,
    verdict: null,
  };
}

const page = (ids: readonly string[], nextCursor: string | null) =>
  ({ entries: ids.map(anEntry), nextCursor }) as unknown as Awaited<
    ReturnType<typeof service.fetchAuditPage>
  >;

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

const ids = (hook: { result: { current: ReturnType<typeof useAuditTrail> } }) =>
  hook.result.current.entries.map((entry) => entry.id);

/**
 * What the trail screen cannot be made to hold still for: two clicks inside one frame, an answer
 * that arrives after its filter was replaced, and a second page that fails. What a person sees is
 * `AuditTrail.spec.tsx`.
 */
describe('the audit trail hook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loaded(filters: AuditFilters = {}) {
    const hook = renderHook((props: { filters: AuditFilters }) => useAuditTrail(props.filters), {
      initialProps: { filters },
    });
    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });
    return hook;
  }

  it('starts loading, then holds the first page', async () => {
    vi.spyOn(service, 'fetchAuditPage').mockResolvedValue(page(['e2', 'e1'], null));

    const hook = renderHook(() => useAuditTrail({}));
    expect(hook.result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(ids(hook)).toEqual(['e2', 'e1']);
    });
    expect(hook.result.current.hasMore).toBe(false);
  });

  it('holds the failure instead of a page', async () => {
    vi.spyOn(service, 'fetchAuditPage').mockRejectedValue(unexpected);

    const hook = await loaded();

    expect(hook.result.current.error).toBe(unexpected);
    expect(hook.result.current.entries).toEqual([]);
    expect(hook.result.current.hasMore).toBe(false);
  });

  it('appends the next page, from the cursor it was handed — S-77', async () => {
    const fetch = vi
      .spyOn(service, 'fetchAuditPage')
      .mockResolvedValueOnce(page(['e4', 'e3'], '3'))
      .mockResolvedValueOnce(page(['e2', 'e1'], null));
    const hook = await loaded({ toolName: 'Bash' });

    act(() => {
      hook.result.current.loadMore();
    });
    await waitFor(() => {
      expect(ids(hook)).toEqual(['e4', 'e3', 'e2', 'e1']);
    });

    expect(fetch).toHaveBeenLastCalledWith({ toolName: 'Bash' }, '3');
    expect(hook.result.current.hasMore).toBe(false);
    expect(hook.result.current.isLoadingMore).toBe(false);
  });

  it('asks for the next page once for two clicks inside the same frame — S-80', async () => {
    const fetch = vi.spyOn(service, 'fetchAuditPage').mockResolvedValueOnce(page(['e2'], '2'));
    const next = deferred<Awaited<ReturnType<typeof service.fetchAuditPage>>>();
    fetch.mockReturnValueOnce(next.promise);
    const hook = await loaded();

    act(() => {
      hook.result.current.loadMore();
      hook.result.current.loadMore();
    });
    expect(hook.result.current.isLoadingMore).toBe(true);

    await act(async () => {
      next.resolve(page(['e1'], null));
      await next.promise;
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(ids(hook)).toEqual(['e2', 'e1']);
  });

  it('keeps what is on screen when the next page fails, and says why — S-77', async () => {
    vi.spyOn(service, 'fetchAuditPage')
      .mockResolvedValueOnce(page(['e2'], '2'))
      .mockRejectedValueOnce(unexpected);
    const hook = await loaded();

    act(() => {
      hook.result.current.loadMore();
    });
    await waitFor(() => {
      expect(hook.result.current.moreError).toBe(unexpected);
    });

    expect(ids(hook)).toEqual(['e2']);
    expect(hook.result.current.hasMore).toBe(true);
    expect(hook.result.current.isLoadingMore).toBe(false);
  });

  it('asks for nothing more when there is nothing more', async () => {
    const fetch = vi.spyOn(service, 'fetchAuditPage').mockResolvedValue(page(['e1'], null));
    const hook = await loaded();

    act(() => {
      hook.result.current.loadMore();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing more while the first page is still loading', () => {
    const fetch = vi.spyOn(service, 'fetchAuditPage').mockReturnValue(new Promise(() => undefined));
    const hook = renderHook(() => useAuditTrail({}));

    act(() => {
      hook.result.current.loadMore();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('starts again from the top on a new filter, dropping the old answer — S-78', async () => {
    const slow = deferred<Awaited<ReturnType<typeof service.fetchAuditPage>>>();
    vi.spyOn(service, 'fetchAuditPage')
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(page(['bash-1'], null));
    const hook = renderHook((props: { filters: AuditFilters }) => useAuditTrail(props.filters), {
      initialProps: { filters: {} as AuditFilters },
    });

    hook.rerender({ filters: { toolName: 'Bash' } });
    await waitFor(() => {
      expect(ids(hook)).toEqual(['bash-1']);
    });

    // The answer to the filter that was replaced arrives last, and lands nowhere.
    await act(async () => {
      slow.resolve(page(['old-1', 'old-2'], '9'));
      await slow.promise;
    });

    expect(ids(hook)).toEqual(['bash-1']);
    expect(hook.result.current.hasMore).toBe(false);
  });

  it('drops a next page that arrives after the filter changed — S-78', async () => {
    const more = deferred<Awaited<ReturnType<typeof service.fetchAuditPage>>>();
    const fetch = vi.spyOn(service, 'fetchAuditPage');
    fetch
      .mockResolvedValueOnce(page(['e2'], '2'))
      .mockReturnValueOnce(more.promise)
      .mockResolvedValueOnce(page(['w1'], null));
    const hook = await loaded();

    act(() => {
      hook.result.current.loadMore();
    });
    hook.rerender({ filters: { toolName: 'Write' } });
    await waitFor(() => {
      expect(ids(hook)).toEqual(['w1']);
    });

    await act(async () => {
      more.resolve(page(['e1'], null));
      await more.promise;
    });

    expect(ids(hook)).toEqual(['w1']);
    expect(hook.result.current.isLoadingMore).toBe(false);
  });

  it('drops the failure of a next page that arrives after the filter changed', async () => {
    const more = deferred<Awaited<ReturnType<typeof service.fetchAuditPage>>>();
    vi.spyOn(service, 'fetchAuditPage')
      .mockResolvedValueOnce(page(['e2'], '2'))
      .mockReturnValueOnce(more.promise)
      .mockResolvedValueOnce(page(['w1'], null));
    const hook = await loaded();

    act(() => {
      hook.result.current.loadMore();
    });
    hook.rerender({ filters: { toolName: 'Write' } });
    await waitFor(() => {
      expect(ids(hook)).toEqual(['w1']);
    });

    await act(async () => {
      more.reject(unexpected);
      await more.promise.catch(() => undefined);
    });

    expect(hook.result.current.moreError).toBeNull();
  });

  it('drops the failure of a first page whose filter was replaced', async () => {
    const slow = deferred<Awaited<ReturnType<typeof service.fetchAuditPage>>>();
    vi.spyOn(service, 'fetchAuditPage')
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(page(['bash-1'], null));
    const hook = renderHook((props: { filters: AuditFilters }) => useAuditTrail(props.filters), {
      initialProps: { filters: {} as AuditFilters },
    });

    hook.rerender({ filters: { toolName: 'Bash' } });
    await waitFor(() => {
      expect(ids(hook)).toEqual(['bash-1']);
    });
    await act(async () => {
      slow.reject(unexpected);
      await slow.promise.catch(() => undefined);
    });

    expect(hook.result.current.error).toBeNull();
  });

  it('does not reload for a new object holding the same filters', async () => {
    const fetch = vi.spyOn(service, 'fetchAuditPage').mockResolvedValue(page(['e1'], null));
    const hook = await loaded({ toolName: 'Bash' });

    hook.rerender({ filters: { toolName: 'Bash' } });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('loads again from the top on a reload', async () => {
    const fetch = vi
      .spyOn(service, 'fetchAuditPage')
      .mockRejectedValueOnce(unexpected)
      .mockResolvedValueOnce(page(['e1'], null));
    const hook = await loaded();

    act(() => {
      hook.result.current.reload();
    });
    expect(hook.result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(ids(hook)).toEqual(['e1']);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
