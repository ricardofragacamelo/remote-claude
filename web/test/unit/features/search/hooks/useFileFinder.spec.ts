import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useFileFinder } from '@/features/search/hooks/useFileFinder';
import { providers } from '../../../../support/render';
import { fakeSearchApi, refusal } from '../../../../support/search-api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFileFinder', () => {
  it('asks nothing while there is no folder, or no request, to locate', () => {
    const { get } = fakeSearchApi({});

    const { result } = renderHook(() => useFileFinder(null, { query: '', kinds: ['file'] }), {
      wrapper: providers(),
    });

    expect(get).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ entries: [], truncated: null, isLoading: false });
  });

  it('locates the folder and request it was asked for', async () => {
    fakeSearchApi({
      locate: () => ({
        entries: [{ path: 'a.ts', kind: 'file', positions: [0] }],
        truncated: null,
      }),
    });

    const { result } = renderHook(
      () => useFileFinder('/srv/projects/a', { query: 'a', kinds: ['file'] }),
      { wrapper: providers() },
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.entries).toEqual([{ path: 'a.ts', kind: 'file', positions: [0] }]);
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps the refusal instead of a result', async () => {
    const error = refusal('WORKSPACE_FOLDER_NOT_OPEN', 'workspace.error.folderNotOpen');
    fakeSearchApi({ locate: () => error });

    const { result } = renderHook(
      () => useFileFinder('/srv/projects/a', { query: 'a', kinds: ['file'] }),
      { wrapper: providers() },
    );

    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
    expect(result.current.entries).toEqual([]);
  });
});
