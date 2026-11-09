import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useRules } from '@/features/permission/hooks/useRules';
import type { RuleListQuery } from '@/features/permission';
import * as service from '@/features/permission/services/rule.service';

const unexpected = {
  code: 'INTERNAL_ERROR',
  messageKey: 'common.error.unexpected',
  params: {},
  traceId: 'trace-1',
};

function aRule(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    scope: 'always',
    kind: 'shell',
    toolName: 'shell',
    pattern: `shell(${id}:*)`,
    decision: 'allow',
    projectPath: null,
    grantedBy: 'user-1',
    grantedAt: '2026-09-24T10:00:00.000Z',
    expiresAt: '2026-12-23T10:00:00.000Z',
    status: 'active',
    revokedAt: null,
    disabled: null,
    ...overrides,
  };
}

const page = (ids: readonly string[], nextCursor: string | null) =>
  ({ rules: ids.map((id) => aRule(id)), nextCursor }) as unknown as Awaited<
    ReturnType<typeof service.fetchRules>
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

const ids = (hook: { result: { current: ReturnType<typeof useRules> } }) =>
  hook.result.current.rules.map((rule) => rule.id);

describe('the rules hook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loaded(query: RuleListQuery = {}) {
    const hook = renderHook((props: { query: RuleListQuery }) => useRules(props.query), {
      initialProps: { query },
    });
    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });
    return hook;
  }

  it('starts loading, then holds the first page', async () => {
    vi.spyOn(service, 'fetchRules').mockResolvedValue(page(['r2', 'r1'], null));

    const hook = renderHook(() => useRules({}));
    expect(hook.result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(ids(hook)).toEqual(['r2', 'r1']);
    });
    expect(hook.result.current.hasMore).toBe(false);
  });

  it('holds the failure instead of a page', async () => {
    vi.spyOn(service, 'fetchRules').mockRejectedValue(unexpected);

    const hook = await loaded();

    expect(hook.result.current.error).toBe(unexpected);
    expect(hook.result.current.rules).toEqual([]);
    expect(hook.result.current.hasMore).toBe(false);
  });

  it('appends the next page, from the cursor it was handed', async () => {
    const fetch = vi
      .spyOn(service, 'fetchRules')
      .mockResolvedValueOnce(page(['r4', 'r3'], '3'))
      .mockResolvedValueOnce(page(['r2', 'r1'], null));
    const hook = await loaded({ decision: 'allow' });

    act(() => {
      hook.result.current.loadMore();
    });
    await waitFor(() => {
      expect(ids(hook)).toEqual(['r4', 'r3', 'r2', 'r1']);
    });

    expect(fetch).toHaveBeenLastCalledWith({ decision: 'allow' }, '3');
    expect(hook.result.current.hasMore).toBe(false);
  });

  it('asks for the next page once for two clicks inside the same frame', async () => {
    const fetch = vi.spyOn(service, 'fetchRules').mockResolvedValueOnce(page(['r2'], '2'));
    const next = deferred<Awaited<ReturnType<typeof service.fetchRules>>>();
    fetch.mockReturnValueOnce(next.promise);
    const hook = await loaded();

    act(() => {
      hook.result.current.loadMore();
      hook.result.current.loadMore();
    });
    expect(hook.result.current.isLoadingMore).toBe(true);

    await act(async () => {
      next.resolve(page(['r1'], null));
      await next.promise;
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(ids(hook)).toEqual(['r2', 'r1']);
  });

  it('keeps what is on screen when the next page fails, and says why', async () => {
    vi.spyOn(service, 'fetchRules')
      .mockResolvedValueOnce(page(['r2'], '2'))
      .mockRejectedValueOnce(unexpected);
    const hook = await loaded();

    act(() => {
      hook.result.current.loadMore();
    });
    await waitFor(() => {
      expect(hook.result.current.moreError).toBe(unexpected);
    });

    expect(ids(hook)).toEqual(['r2']);
    expect(hook.result.current.hasMore).toBe(true);
  });

  it('starts again from the top on a new query, dropping the old answer — S-158', async () => {
    const slow = deferred<Awaited<ReturnType<typeof service.fetchRules>>>();
    vi.spyOn(service, 'fetchRules')
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(page(['deny-1'], null));
    const hook = renderHook((props: { query: RuleListQuery }) => useRules(props.query), {
      initialProps: { query: {} as RuleListQuery },
    });

    hook.rerender({ query: { decision: 'deny' } });
    await waitFor(() => {
      expect(ids(hook)).toEqual(['deny-1']);
    });

    // The answer to the query that was replaced arrives last, and lands nowhere.
    await act(async () => {
      slow.resolve(page(['old-1', 'old-2'], '9'));
      await slow.promise;
    });

    expect(ids(hook)).toEqual(['deny-1']);
  });

  it('drops the failure of a first page whose query was replaced', async () => {
    const slow = deferred<Awaited<ReturnType<typeof service.fetchRules>>>();
    vi.spyOn(service, 'fetchRules')
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(page(['deny-1'], null));
    const hook = renderHook((props: { query: RuleListQuery }) => useRules(props.query), {
      initialProps: { query: {} as RuleListQuery },
    });

    hook.rerender({ query: { decision: 'deny' } });
    await waitFor(() => {
      expect(ids(hook)).toEqual(['deny-1']);
    });
    await act(async () => {
      slow.reject(unexpected);
      await slow.promise.catch(() => undefined);
    });

    expect(hook.result.current.error).toBeNull();
  });

  it('ignores `updateRule`/`removeRule` before the first page has arrived', () => {
    vi.spyOn(service, 'fetchRules').mockReturnValue(new Promise(() => undefined));
    const hook = renderHook(() => useRules({}));

    act(() => {
      hook.result.current.removeRule('r1');
      hook.result.current.updateRule(aRule('r1') as never);
    });

    expect(hook.result.current.rules).toEqual([]);
  });

  it('does not reload for a new object holding the same query', async () => {
    const fetch = vi.spyOn(service, 'fetchRules').mockResolvedValue(page(['r1'], null));
    const hook = await loaded({ decision: 'allow' });

    hook.rerender({ query: { decision: 'allow' } });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('loads again from the top on a reload', async () => {
    const fetch = vi
      .spyOn(service, 'fetchRules')
      .mockRejectedValueOnce(unexpected)
      .mockResolvedValueOnce(page(['r1'], null));
    const hook = await loaded();

    act(() => {
      hook.result.current.reload();
    });
    expect(hook.result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(ids(hook)).toEqual(['r1']);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('asks for nothing more when there is nothing more', async () => {
    const fetch = vi.spyOn(service, 'fetchRules').mockResolvedValue(page(['r1'], null));
    const hook = await loaded();

    act(() => {
      hook.result.current.loadMore();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing more while the first page is still loading', () => {
    const fetch = vi.spyOn(service, 'fetchRules').mockReturnValue(new Promise(() => undefined));
    const hook = renderHook(() => useRules({}));

    act(() => {
      hook.result.current.loadMore();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('drops a next page that arrives after the query changed', async () => {
    const more = deferred<Awaited<ReturnType<typeof service.fetchRules>>>();
    const fetch = vi.spyOn(service, 'fetchRules');
    fetch
      .mockResolvedValueOnce(page(['r2'], '2'))
      .mockReturnValueOnce(more.promise)
      .mockResolvedValueOnce(page(['d1'], null));
    const hook = await loaded();

    act(() => {
      hook.result.current.loadMore();
    });
    hook.rerender({ query: { decision: 'deny' } });
    await waitFor(() => {
      expect(ids(hook)).toEqual(['d1']);
    });

    await act(async () => {
      more.resolve(page(['r1'], null));
      await more.promise;
    });

    expect(ids(hook)).toEqual(['d1']);
  });

  it('removes a rule from the page without asking the server again — S-16', async () => {
    vi.spyOn(service, 'fetchRules').mockResolvedValue(page(['r1', 'r2'], null));
    const fetch = vi.spyOn(service, 'fetchRules');
    const hook = await loaded();
    fetch.mockClear();

    act(() => {
      hook.result.current.removeRule('r1');
    });

    expect(ids(hook)).toEqual(['r2']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('replaces a rule in place, from an answer already in hand', async () => {
    vi.spyOn(service, 'fetchRules').mockResolvedValue(page(['r1', 'r2'], null));
    const hook = await loaded();
    const changed = aRule('r1', { expiresAt: '2027-01-01T00:00:00.000Z' }) as never;

    act(() => {
      hook.result.current.updateRule(changed);
    });

    expect(hook.result.current.rules.find((rule) => rule.id === 'r1')).toEqual(changed);
  });
});
