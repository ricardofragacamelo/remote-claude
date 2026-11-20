import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { SearchTextFramePayload } from '@remote-claude/contracts';

import { useTextSearch } from '@/features/search/hooks/useTextSearch';
import type { SearchQuery } from '@/features/search/types/search';
import { api } from '@/shared/api/api';
import { providers } from '../../../../support/render';
import { fakeSearchApi, pendingStream, refusal } from '../../../../support/search-api';

afterEach(() => {
  vi.restoreAllMocks();
});

const aQuery: SearchQuery = {
  pattern: 'TODO',
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  useIgnoreFiles: true,
};

describe('useTextSearch', () => {
  it('asks nothing while there is no folder, or no request, to search', () => {
    const { ndjson } = fakeSearchApi({});

    const { result } = renderHook(() => useTextSearch(null, aQuery), { wrapper: providers() });

    expect(ndjson).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      files: [],
      truncated: null,
      skipped: 0,
      isSearching: false,
    });
  });

  it('shows files as each one closes, sorted by path — never waiting for the end line', async () => {
    const stream = pendingStream<SearchTextFramePayload>();
    fakeSearchApi({ text: () => stream.iterable });

    const { result } = renderHook(() => useTextSearch('/srv/projects/a', aQuery), {
      wrapper: providers(),
    });
    expect(result.current.isSearching).toBe(true);

    act(() => {
      stream.push({ type: 'file', path: 'b.ts', matches: [], contextLines: [] });
    });
    await waitFor(() => {
      expect(result.current.files).toEqual([{ path: 'b.ts', matches: [], contextLines: [] }]);
    });
    expect(result.current.isSearching).toBe(true);

    act(() => {
      stream.push({ type: 'file', path: 'a.ts', matches: [], contextLines: [] });
    });
    await waitFor(() => {
      expect(result.current.files.map((file) => file.path)).toEqual(['a.ts', 'b.ts']);
    });

    act(() => {
      stream.push({ type: 'end', truncated: { reason: 'limit' }, skipped: 2 });
      stream.finish();
    });
    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
    });
    expect(result.current.truncated).toEqual({ reason: 'limit' });
    expect(result.current.skipped).toBe(2);
  });

  it('throws the stream’s own error frame as the hook’s error, keeping what already arrived', async () => {
    fakeSearchApi({
      text: () => [
        { type: 'file', path: 'a.ts', matches: [], contextLines: [] },
        { type: 'error', code: 'SEARCH_ENGINE_FAILED', messageKey: 'search.error.engineFailed' },
      ],
    });

    const { result } = renderHook(() => useTextSearch('/srv/projects/a', aQuery), {
      wrapper: providers(),
    });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({ code: 'SEARCH_ENGINE_FAILED' });
    });
    expect(result.current.files).toEqual([{ path: 'a.ts', matches: [], contextLines: [] }]);
  });

  it('reports a connection cut as SEARCH_ENGINE_FAILED, never a raw stream end', async () => {
    fakeSearchApi({ text: () => [{ type: 'file', path: 'a.ts', matches: [], contextLines: [] }] });

    const { result } = renderHook(() => useTextSearch('/srv/projects/a', aQuery), {
      wrapper: providers(),
    });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({ code: 'SEARCH_ENGINE_FAILED' });
    });
  });

  it('runs the same search again on reload — B-15’s "search again" (S-123)', async () => {
    const { ndjson } = fakeSearchApi({
      text: () => [{ type: 'file', path: 'a.ts', matches: [], contextLines: [] }, { type: 'end' }],
    });

    const { result } = renderHook(() => useTextSearch('/srv/projects/a', aQuery), {
      wrapper: providers(),
    });
    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
    });

    act(() => {
      result.current.reload();
    });

    await waitFor(() => {
      expect(ndjson).toHaveBeenCalledTimes(2);
    });
  });

  it('propagates a refusal thrown before the first byte', async () => {
    const error = refusal('INVALID_INPUT', 'search.error.queryInvalid');
    fakeSearchApi({ text: () => error });

    const { result } = renderHook(() => useTextSearch('/srv/projects/a', aQuery), {
      wrapper: providers(),
    });

    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
  });

  it('cancels the search nobody is waiting for any more, and only the last answer reaches the screen (S-62, S-102)', async () => {
    const streams = new Map<string, ReturnType<typeof pendingStream<SearchTextFramePayload>>>();
    const signals = new Map<string, AbortSignal>();
    vi.spyOn(api, 'ndjson').mockImplementation(
      (path: string, body: unknown, options?: { signal?: AbortSignal }) => {
        if (path !== '/search/text') throw new Error('unexpected path');
        const pattern = (body as { pattern: string }).pattern;
        if (options?.signal !== undefined) signals.set(pattern, options.signal);
        const stream = pendingStream<SearchTextFramePayload>();
        streams.set(pattern, stream);
        return stream.iterable as never;
      },
    );

    const { result, rerender } = renderHook(
      ({ request }: { request: SearchQuery }) => useTextSearch('/srv/projects/a', request),
      { wrapper: providers(), initialProps: { request: aQuery } },
    );
    await waitFor(() => {
      expect(signals.has('TODO')).toBe(true);
    });

    rerender({ request: { ...aQuery, pattern: 'DONE' } });
    await waitFor(() => {
      expect(signals.has('DONE')).toBe(true);
    });
    await waitFor(() => {
      expect(signals.get('TODO')?.aborted).toBe(true);
    });

    // The folder being searched now answers first; the superseded query answers late.
    act(() => {
      streams.get('DONE')?.push({ type: 'file', path: 'done.ts', matches: [], contextLines: [] });
      streams.get('DONE')?.push({ type: 'end', truncated: null, skipped: 0 });
      streams.get('DONE')?.finish();
    });
    await waitFor(() => {
      expect(result.current.files).toEqual([{ path: 'done.ts', matches: [], contextLines: [] }]);
    });

    await act(async () => {
      streams.get('TODO')?.push({ type: 'file', path: 'todo.ts', matches: [], contextLines: [] });
      streams.get('TODO')?.finish();
      await Promise.resolve();
    });

    expect(result.current.files).toEqual([{ path: 'done.ts', matches: [], contextLines: [] }]);
  });
});
