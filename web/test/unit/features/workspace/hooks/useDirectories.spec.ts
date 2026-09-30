import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useDirectories } from '@/features/workspace/hooks/useDirectories';
import type { DirectoryQuery } from '@/features/workspace/types/workspace';
import { api } from '@/shared/api/api';
import { providers } from '../../../../support/render';
import { aListing, projects, refusal } from '../../../../support/workspace-api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the listing of one folder', () => {
  it('asks nothing while there is no folder to list', () => {
    const get = vi.spyOn(api, 'get');

    const { result } = renderHook(() => useDirectories(null), { wrapper: providers() });

    expect(get).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ listing: undefined, isLoading: false, error: null });
  });

  it('lists the folder it was asked for', async () => {
    const listing = aListing(projects, projects.path, ['app', 'docs']);
    vi.spyOn(api, 'get').mockResolvedValue(listing);

    const { result } = renderHook(() => useDirectories({ path: projects.path, hidden: false }), {
      wrapper: providers(),
    });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.listing).toEqual(listing);
    });
  });

  it('shows only the answer to the last question, whatever order they come back in — S-77', async () => {
    const answers = new Map<string, (listing: unknown) => void>();
    const signals = new Map<string, AbortSignal>();
    vi.spyOn(api, 'get').mockImplementation((path: string, options?: { signal?: AbortSignal }) => {
      const asked = new URLSearchParams(path.split('?')[1]).get('path') ?? '';
      if (options?.signal !== undefined) signals.set(asked, options.signal);
      return new Promise((resolve) => {
        answers.set(asked, resolve);
      });
    });

    const { result, rerender } = renderHook(
      ({ request }: { request: DirectoryQuery }) => useDirectories(request),
      {
        wrapper: providers(),
        initialProps: { request: { path: '/srv/projects/a', hidden: false } },
      },
    );
    rerender({ request: { path: '/srv/projects/b', hidden: false } });
    await waitFor(() => {
      expect(answers.size).toBe(2);
    });

    // The folder the person is in answers first; the one left behind answers late.
    const b = aListing(projects, '/srv/projects/b', ['from-b']);
    act(() => {
      answers.get('/srv/projects/b')?.(b);
    });
    await waitFor(() => {
      expect(result.current.listing).toEqual(b);
    });

    await act(async () => {
      answers.get('/srv/projects/a')?.(aListing(projects, '/srv/projects/a', ['from-a']));
      await Promise.resolve();
    });

    expect(result.current.listing).toEqual(b);
    // Nobody was waiting for the first one any more, so it was called off.
    expect(signals.get('/srv/projects/a')?.aborted).toBe(true);
  });

  it('keeps the refusal instead of a listing', async () => {
    const unreadable = refusal(
      'WORKSPACE_DIRECTORY_UNREADABLE',
      'workspace.error.directoryUnreadable',
    );
    vi.spyOn(api, 'get').mockRejectedValue(unreadable);

    const { result } = renderHook(() => useDirectories({ path: projects.path, hidden: false }), {
      wrapper: providers(),
    });

    await waitFor(() => {
      expect(result.current.error).toBe(unreadable);
    });
    expect(result.current.listing).toBeUndefined();
  });

  it('asks again on reload', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(aListing(projects, projects.path, []));
    const { result } = renderHook(() => useDirectories({ path: projects.path, hidden: false }), {
      wrapper: providers(),
    });
    await waitFor(() => {
      expect(result.current.listing).toBeDefined();
    });

    act(() => {
      result.current.reload();
    });

    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(2);
    });
  });
});
