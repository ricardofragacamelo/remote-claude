import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useOpenFolders } from '@/features/workspace/hooks/useOpenFolders';
import { useRecentFolders } from '@/features/workspace/hooks/useRecentFolders';
import { useRoots } from '@/features/workspace/hooks/useRoots';
import { providers } from '../../../../support/render';
import { fakeWorkspaceApi, projects, refusal, scratch } from '../../../../support/workspace-api';

afterEach(() => {
  vi.restoreAllMocks();
});

const tab = { path: '/srv/projects/app', rootLabel: 'Projects', state: 'available' as const };

describe('the folder tabs', () => {
  it('reads them in the order the user left them', async () => {
    fakeWorkspaceApi({ openFolders: [tab] });

    const { result } = renderHook(() => useOpenFolders(), { wrapper: providers() });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.folders).toEqual([tab]);
    });
  });

  it('opens one, and reads both the tabs and the recent folders again', async () => {
    const api = fakeWorkspaceApi({ openFolders: [], recent: [], open: () => tab });
    const wrapper = providers();
    const { result } = renderHook(() => useOpenFolders(), { wrapper });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let opened: unknown;
    await act(async () => {
      opened = await result.current.open('/srv/projects/app');
    });

    expect(opened).toEqual(tab);
    await waitFor(() => {
      expect(
        api.get.mock.calls.filter(([path]) => path === '/workspaces/open-folders'),
      ).toHaveLength(2);
    });
  });

  it('keeps the same way to open across renders, so an effect does not open twice', async () => {
    fakeWorkspaceApi({ openFolders: [] });
    const { result, rerender } = renderHook(() => useOpenFolders(), { wrapper: providers() });
    const first = result.current.open;

    rerender();

    expect(result.current.open).toBe(first);
  });

  it('lets a refusal through as it came, for the caller to say where', async () => {
    const full = refusal('OPEN_FOLDERS_LIMIT_REACHED', 'workspace.error.openFoldersLimitReached');
    fakeWorkspaceApi({ openFolders: [], open: () => full });
    const { result } = renderHook(() => useOpenFolders(), { wrapper: providers() });

    await expect(result.current.open('/srv/projects/app')).rejects.toBe(full);
  });

  it('keeps the failure to read them, and reads again on reload', async () => {
    const offline = refusal('NETWORK_UNREACHABLE', 'common.error.offline');
    const api = fakeWorkspaceApi({ openFolders: offline });
    const { result } = renderHook(() => useOpenFolders(), { wrapper: providers() });
    await waitFor(() => {
      expect(result.current.error).toBe(offline);
    });

    act(() => {
      result.current.reload();
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });
});

describe('the roots', () => {
  it('reads them, and reads again on reload', async () => {
    const api = fakeWorkspaceApi({ roots: [scratch, projects] });
    const { result } = renderHook(() => useRoots(), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current.roots).toEqual([scratch, projects]);
    });

    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });
});

describe('closing and moving folder tabs — plan 06, B-20', () => {
  it('reads nothing for somebody who is not signed in', () => {
    const api = fakeWorkspaceApi({ openFolders: [tab] });

    const { result } = renderHook(() => useOpenFolders({ enabled: false }), {
      wrapper: providers(),
    });

    expect(result.current.folders).toEqual([]);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('closes one, and reads the tabs and the recent folders again', async () => {
    const api = fakeWorkspaceApi({ openFolders: [tab], recent: [], close: () => undefined });
    // The welcome screen reads the recent folders; with it on screen, they are read again.
    const { result } = renderHook(() => ({ tabs: useOpenFolders(), recent: useRecentFolders() }), {
      wrapper: providers(),
    });
    await waitFor(() => {
      expect(result.current.tabs.folders).toEqual([tab]);
    });
    api.get.mockClear();

    await act(async () => {
      await result.current.tabs.close(tab.path);
    });

    expect(api.remove).toHaveBeenCalledWith(
      `/workspaces/open-folders?path=${encodeURIComponent(tab.path)}`,
    );
    const asked = api.get.mock.calls.map(([path]) => path);
    expect(asked).toEqual(
      expect.arrayContaining(['/workspaces/open-folders', '/workspaces/recent']),
    );
  });

  it('moves them, and reads the tabs again even when another window moved first — S-107', async () => {
    const api = fakeWorkspaceApi({
      openFolders: [tab],
      order: () => refusal('CONFLICT', 'workspace.error.openFoldersOrderConflict'),
    });
    const { result } = renderHook(() => useOpenFolders(), { wrapper: providers() });
    await waitFor(() => {
      expect(result.current.folders).toEqual([tab]);
    });
    api.get.mockClear();

    let failure: unknown;
    await act(async () => {
      await result.current.reorder([tab.path]).catch((error: unknown) => {
        failure = error;
      });
    });

    expect(failure).toMatchObject({ code: 'CONFLICT' });
    expect(api.get).toHaveBeenCalledWith('/workspaces/open-folders');
  });
});
