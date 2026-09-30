import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useFolder } from '@/features/workspace/hooks/useFolder';
import { providers } from '../../../../support/render';
import { fakeWorkspaceApi, projects, refusal } from '../../../../support/workspace-api';

afterEach(() => {
  vi.restoreAllMocks();
});

const APP = '/srv/projects/app';
const tab = { path: APP, rootLabel: 'Projects', state: 'available' as const };

describe('the folder of the workbench — B-16', () => {
  it('resolves the folder first, and then records it as open — once', async () => {
    const api = fakeWorkspaceApi({
      resolve: (path) => ({ path, root: projects }),
      open: () => tab,
    });
    const moved = vi.fn();

    const { result, rerender } = renderHook(() => useFolder(APP, moved), { wrapper: providers() });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.folder).toEqual({ path: APP, name: 'app', root: projects });
    });
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/workspaces/open-folders', { path: APP });
    });

    rerender();
    rerender();

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(moved).not.toHaveBeenCalled();
    expect(result.current.recordError).toBeNull();
  });

  it('says where a link really points, and records the real folder — S-78', async () => {
    const api = fakeWorkspaceApi({
      resolve: () => ({ path: `${projects.path}/real`, root: projects }),
      open: () => tab,
    });
    const moved = vi.fn();

    renderHook(() => useFolder(`${projects.path}/link`, moved), { wrapper: providers() });

    await waitFor(() => {
      expect(moved).toHaveBeenCalledWith(`${projects.path}/real`);
    });
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/workspaces/open-folders', {
        path: `${projects.path}/real`,
      });
    });
  });

  it('asks nothing more for the real folder once the link resolved to it', async () => {
    const api = fakeWorkspaceApi({
      resolve: () => ({ path: `${projects.path}/real`, root: projects }),
      open: () => tab,
    });
    const wrapper = providers();
    const { result, rerender } = renderHook(({ folder }) => useFolder(folder, vi.fn()), {
      wrapper,
      initialProps: { folder: `${projects.path}/link` },
    });
    await waitFor(() => {
      expect(result.current.folder).toBeDefined();
    });

    rerender({ folder: `${projects.path}/real` });

    expect(result.current.folder?.path).toBe(`${projects.path}/real`);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(1);
    });
  });

  it.each([
    ['WORKSPACE_NOT_ALLOWED', 'workspace.error.notAllowed'],
    ['WORKSPACE_NOT_FOUND', 'workspace.error.notFound'],
    ['WORKSPACE_NOT_A_DIRECTORY', 'workspace.error.notADirectory'],
  ])('keeps %s as the reason, and records nothing — S-79…S-81', async (code, key) => {
    const refused = refusal(code, key, { path: '/etc' });
    const api = fakeWorkspaceApi({ resolve: () => refused, open: () => tab });

    const { result } = renderHook(() => useFolder('/etc', vi.fn()), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current.error).toBe(refused);
    });
    expect(result.current.folder).toBeUndefined();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps the folder when it could not be recorded, and says why beside it — S-183', async () => {
    const full = refusal('OPEN_FOLDERS_LIMIT_REACHED', 'workspace.error.openFoldersLimitReached', {
      limit: 8,
    });
    fakeWorkspaceApi({ resolve: (path) => ({ path, root: projects }), open: () => full });

    const { result } = renderHook(() => useFolder(APP, vi.fn()), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current.recordError).toBe(full);
    });
    expect(result.current.folder?.path).toBe(APP);
    expect(result.current.error).toBeNull();
  });

  it('asks again on reload', async () => {
    const api = fakeWorkspaceApi({
      resolve: (path) => ({ path, root: projects }),
      open: () => tab,
    });
    const { result } = renderHook(() => useFolder(APP, vi.fn()), { wrapper: providers() });
    await waitFor(() => {
      expect(result.current.folder).toBeDefined();
    });

    act(() => {
      result.current.reload();
    });

    await waitFor(() => {
      expect(
        api.get.mock.calls.filter(([path]) => String(path).startsWith('/workspaces/resolve')),
      ).toHaveLength(2);
    });
  });
});
