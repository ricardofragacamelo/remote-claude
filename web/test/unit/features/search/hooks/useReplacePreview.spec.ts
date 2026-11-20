import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { SearchReplacePreviewFramePayload } from '@remote-claude/contracts';

import { useReplacePreview } from '@/features/search/hooks/useReplacePreview';
import type { ReplaceQuery } from '@/features/search/types/search';
import { providers } from '../../../../support/render';
import { fakeSearchApi, pendingStream, refusal } from '../../../../support/search-api';

afterEach(() => {
  vi.restoreAllMocks();
});

const aQuery: ReplaceQuery = {
  pattern: 'TODO',
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  useIgnoreFiles: true,
  replacement: 'DONE',
  preserveCase: false,
};

describe('useReplacePreview', () => {
  it('asks nothing while there is no folder, or no request, to preview', () => {
    const { ndjson } = fakeSearchApi({});

    const { result } = renderHook(() => useReplacePreview(null, aQuery), { wrapper: providers() });

    expect(ndjson).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      files: [],
      truncated: null,
      skipped: 0,
      isPreviewing: false,
    });
  });

  it('shows files, with their etag, as each one closes — still previewing while more may arrive', async () => {
    const stream = pendingStream<SearchReplacePreviewFramePayload>();
    fakeSearchApi({ replacePreview: () => stream.iterable });

    const { result } = renderHook(() => useReplacePreview('/srv/projects/a', aQuery), {
      wrapper: providers(),
    });
    expect(result.current.isPreviewing).toBe(true);

    act(() => {
      stream.push({ type: 'file', path: 'b.ts', etag: 'sha256:abc', matches: [] });
    });
    await waitFor(() => {
      expect(result.current.files).toEqual([{ path: 'b.ts', etag: 'sha256:abc', matches: [] }]);
    });
    expect(result.current.isPreviewing).toBe(true);

    act(() => {
      stream.push({ type: 'file', path: 'a.ts', etag: 'sha256:def', matches: [] });
    });
    await waitFor(() => {
      expect(result.current.files.map((file) => file.path)).toEqual(['a.ts', 'b.ts']);
    });

    act(() => {
      stream.push({ type: 'end', truncated: null, skipped: 0 });
      stream.finish();
    });
    await waitFor(() => {
      expect(result.current.isPreviewing).toBe(false);
    });
  });

  it('propagates a refusal thrown before the first byte', async () => {
    const error = refusal('INVALID_INPUT', 'search.error.queryInvalid');
    fakeSearchApi({ replacePreview: () => error });

    const { result } = renderHook(() => useReplacePreview('/srv/projects/a', aQuery), {
      wrapper: providers(),
    });

    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
  });

  it('reports a connection cut as SEARCH_ENGINE_FAILED', async () => {
    fakeSearchApi({
      replacePreview: () => [{ type: 'file', path: 'a.ts', etag: 'x', matches: [] }],
    });

    const { result } = renderHook(() => useReplacePreview('/srv/projects/a', aQuery), {
      wrapper: providers(),
    });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({ code: 'SEARCH_ENGINE_FAILED' });
    });
  });
});
