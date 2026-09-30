import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { SEARCH_AFTER, useRecentFolders } from '@/features/workspace/hooks/useRecentFolders';
import { providers } from '../../../../support/render';
import { fakeWorkspaceApi, refusal } from '../../../../support/workspace-api';
import type { RecentDto } from '../../../../support/workspace-api';

afterEach(() => {
  vi.restoreAllMocks();
});

function aRecent(name: string, overrides: Partial<RecentDto> = {}): RecentDto {
  return {
    path: `/srv/projects/${name}`,
    rootLabel: 'Projects',
    lastOpenedAt: '2026-09-29T10:00:00.000Z',
    pinned: false,
    available: true,
    ...overrides,
  };
}

async function mounted() {
  const hook = renderHook(() => useRecentFolders(), { wrapper: providers() });
  await waitFor(() => {
    expect(hook.result.current.isLoading).toBe(false);
  });
  return hook;
}

describe('the recent folders', () => {
  it('reads them from the server', async () => {
    fakeWorkspaceApi({ recent: [aRecent('app')] });

    const { result } = await mounted();

    expect(result.current.folders.map((folder) => folder.name)).toEqual(['app']);
    expect(result.current.error).toBeNull();
  });

  it('keeps the failure to read them, and reads again on reload', async () => {
    const offline = refusal('NETWORK_UNREACHABLE', 'common.error.offline');
    const api = fakeWorkspaceApi({ recent: offline });
    const { result } = await mounted();

    expect(result.current.error).toBe(offline);

    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });
});

describe('the search — S-185', () => {
  it('is offered only once the list is longer than a screen', async () => {
    const eight = Array.from({ length: SEARCH_AFTER }, (_, index) =>
      aRecent(`app${String(index)}`),
    );
    fakeWorkspaceApi({ recent: eight });

    expect((await mounted()).result.current.searchable).toBe(false);
  });

  it('narrows by name and by path, ignoring case and the spaces around', async () => {
    const many = Array.from({ length: SEARCH_AFTER + 1 }, (_, index) =>
      aRecent(`app${String(index)}`),
    );
    fakeWorkspaceApi({
      recent: [...many, aRecent('Docs'), aRecent('x', { path: '/home/u/Notes/x' })],
    });
    const { result } = await mounted();

    expect(result.current.searchable).toBe(true);
    act(() => {
      result.current.setSearch('  docs ');
    });
    expect(result.current.visible.map((folder) => folder.name)).toEqual(['Docs']);

    act(() => {
      result.current.setSearch('notes');
    });
    expect(result.current.visible.map((folder) => folder.name)).toEqual(['x']);

    act(() => {
      result.current.setSearch('nothing like it');
    });
    expect(result.current.visible).toEqual([]);
    // Matching nothing is not having nothing.
    expect(result.current.folders).toHaveLength(many.length + 2);
  });
});

describe('changing a row — S-70, S-184', () => {
  it('pins, and reads the list again rather than moving the row itself', async () => {
    const api = fakeWorkspaceApi({ recent: [aRecent('app')], pin: () => undefined });
    const { result } = await mounted();

    act(() => {
      result.current.pin('/srv/projects/app', true);
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
    expect(api.put).toHaveBeenCalledWith('/workspaces/recent/pin', {
      path: '/srv/projects/app',
      pinned: true,
    });
  });

  it('forgets', async () => {
    const api = fakeWorkspaceApi({ recent: [aRecent('app')], forget: () => undefined });
    const { result } = await mounted();

    act(() => {
      result.current.forget('/srv/projects/app');
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
    expect(api.remove).toHaveBeenCalledTimes(1);
  });

  it('sends one change for two clicks in the same tick, and says the row is busy', async () => {
    let answer: () => void = () => undefined;
    const api = fakeWorkspaceApi({
      recent: [aRecent('app')],
      pin: () => () =>
        new Promise<undefined>((resolve) => {
          answer = () => resolve(undefined);
        }),
    });
    const { result } = await mounted();

    act(() => {
      result.current.pin('/srv/projects/app', true);
      result.current.pin('/srv/projects/app', true);
    });

    expect(api.put).toHaveBeenCalledTimes(1);
    expect(result.current.isBusy('/srv/projects/app')).toBe(true);
    expect(result.current.isBusy('/srv/projects/other')).toBe(false);

    await act(async () => {
      answer();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.isBusy('/srv/projects/app')).toBe(false);
    });
  });

  it('keeps the row as it was and the reason beside it, until the next attempt', async () => {
    const offline = refusal('NETWORK_UNREACHABLE', 'common.error.offline');
    let refuse = true;
    const api = fakeWorkspaceApi({
      recent: [aRecent('app')],
      forget: () => (refuse ? offline : undefined),
    });
    const { result } = await mounted();

    act(() => {
      result.current.forget('/srv/projects/app');
    });
    await waitFor(() => {
      expect(result.current.failureOf('/srv/projects/app')).toBe(offline);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(result.current.folders).toHaveLength(1);
    expect(result.current.failureOf('/srv/projects/other')).toBeNull();

    refuse = false;
    act(() => {
      result.current.forget('/srv/projects/app');
    });

    // The reason goes as soon as the next attempt leaves, not when it lands.
    expect(result.current.failureOf('/srv/projects/app')).toBeNull();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });
});
