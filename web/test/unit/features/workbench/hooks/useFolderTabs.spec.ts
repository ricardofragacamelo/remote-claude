import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { neighbourAfter, useFolderTabs } from '@/features/workbench/hooks/useFolderTabs';
import type { FolderTabsRoutes } from '@/features/workbench/hooks/useFolderTabs';
import { folderTabStore } from '@/features/workbench/store/folder-tab.store';
import { wsClient } from '@/shared/api/ws';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import { providers } from '../../../../support/render';
import { aTab, aTabServer, fakeWorkspaceApi, refusal } from '../../../../support/workspace-api';
import type { WorkspaceRoutes } from '../../../../support/workspace-api';

const A = '/srv/projects/a';
const B = '/srv/projects/b';
const C = '/srv/projects/c';

afterEach(() => {
  vi.restoreAllMocks();
});

function mount(routes: WorkspaceRoutes, active: string = A) {
  const api = fakeWorkspaceApi(routes);
  const onActivate = vi.fn();
  const onWelcome = vi.fn();
  const props: FolderTabsRoutes = { active, onActivate, onWelcome };
  const hook = renderHook((current: FolderTabsRoutes) => useFolderTabs(current), {
    wrapper: providers(),
    initialProps: props,
  });

  return { ...hook, api, onActivate, onWelcome, props };
}

async function loaded(result: { current: ReturnType<typeof useFolderTabs> }, count: number) {
  await waitFor(() => {
    expect(result.current.tabs.filter((tab) => tab.kept)).toHaveLength(count);
  });
}

describe('the tab on screen once some close — plan 06, S-102', () => {
  it('is the neighbour to the right', () => {
    expect(neighbourAfter([A, B, C], B, [B])).toBe(C);
  });

  it('is the one to the left when there is none to the right', () => {
    expect(neighbourAfter([A, B, C], C, [C])).toBe(B);
  });

  it('skips the ones closing with it', () => {
    expect(neighbourAfter([A, B, C], A, [A, B])).toBe(C);
    expect(neighbourAfter([A, B, C], C, [B, C])).toBe(A);
  });

  it('is none when every tab goes', () => {
    expect(neighbourAfter([A], A, [A])).toBeNull();
  });
});

describe('the folder tabs — plan 06, B-20', () => {
  it('are the server’s, in its order — and the folder the address names, at the end, until kept (S-103)', async () => {
    const { result } = mount({ openFolders: [aTab(B), aTab(C)] }, A);
    await loaded(result, 2);

    expect(result.current.tabs.map((tab) => [tab.path, tab.kept])).toEqual([
      [B, true],
      [C, true],
      [A, false],
    ]);
    expect(result.current.tabs[2]).toMatchObject({
      name: 'a',
      rootLabel: null,
      state: 'available',
    });
  });

  it('say what the server says of each: a folder that left the allowlist or the disk (S-104)', async () => {
    const { result } = mount({
      openFolders: [aTab(A), { path: B, rootLabel: null, state: 'notAllowed' }],
    });
    await loaded(result, 2);

    expect(result.current.tabs[1]).toMatchObject({ path: B, state: 'notAllowed', name: 'b' });
  });

  it('remember which was on screen, for the navigation to lead back to it', async () => {
    const { result } = mount({ openFolders: [aTab(A)] }, A);
    await loaded(result, 1);

    expect(localStorage.getItem(`${VISITOR_PREFIX}workbench.lastFolder`)).toBe(JSON.stringify(A));
  });

  it('always have the tab on screen among them — kept or not yet', async () => {
    const { result } = mount({ openFolders: [aTab(A)] }, A);
    await loaded(result, 1);

    expect(result.current.current).toMatchObject({ path: A, kept: true });
  });
});

describe('closing folder tabs — plan 06, S-101, S-102, S-109', () => {
  it('asks first, and closes nothing on "keep open"', async () => {
    const { result, api } = mount({ openFolders: [aTab(A)] });
    await loaded(result, 1);

    act(() => {
      result.current.askClose([A]);
    });
    expect(result.current.closing).toEqual([A]);

    act(() => {
      result.current.cancelClose();
    });
    expect(result.current.closing).toBeNull();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it('asks for nothing when there is nothing to close', async () => {
    const { result } = mount({ openFolders: [aTab(A)] });
    await loaded(result, 1);

    act(() => {
      result.current.askClose([]);
    });

    expect(result.current.closing).toBeNull();
  });

  it('closes the one on screen and puts its right neighbour there', async () => {
    const server = aTabServer([aTab(A), aTab(B), aTab(C)]);
    const { result, api, onActivate } = mount(server.routes, B);
    await loaded(result, 3);

    act(() => {
      result.current.askClose([B]);
    });
    act(() => {
      result.current.confirmClose();
    });

    await waitFor(() => {
      expect(onActivate).toHaveBeenCalledWith(C);
    });
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(server.paths()).toEqual([A, C]);
    expect(result.current.closing).toBeNull();
  });

  it('forgets the state of a tab it closed: opened again, it starts over', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    folderTabStore(B).getState().setDraft('half a prompt');
    const { result } = mount(server.routes, A);
    await loaded(result, 2);

    act(() => {
      result.current.askClose([B]);
    });
    act(() => {
      result.current.confirmClose();
    });

    await waitFor(() => {
      expect(server.paths()).toEqual([A]);
    });
    expect(folderTabStore(B).getState().draft).toBe('');
  });

  it('closes a tab that is not on screen without moving away from the one that is', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const { result, onActivate, onWelcome } = mount(server.routes, A);
    await loaded(result, 2);

    act(() => {
      result.current.askClose([B]);
    });
    act(() => {
      result.current.confirmClose();
    });

    await waitFor(() => {
      expect(result.current.closing).toBeNull();
    });
    expect(onActivate).not.toHaveBeenCalled();
    expect(onWelcome).not.toHaveBeenCalled();
  });

  it('goes back to the welcome screen when the last tab closes', async () => {
    const server = aTabServer([aTab(A)]);
    const { result, onWelcome } = mount(server.routes, A);
    await loaded(result, 1);

    act(() => {
      result.current.askClose([A]);
    });
    act(() => {
      result.current.confirmClose();
    });

    await waitFor(() => {
      expect(onWelcome).toHaveBeenCalledTimes(1);
    });
  });

  it('closes once, however many times "close" is confirmed before the first answers (S-109)', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const { result, api } = mount(server.routes, A);
    await loaded(result, 2);

    act(() => {
      result.current.askClose([B]);
    });
    act(() => {
      result.current.confirmClose();
      result.current.confirmClose();
      result.current.cancelClose();
    });

    await waitFor(() => {
      expect(result.current.isClosing).toBe(false);
    });
    expect(api.remove).toHaveBeenCalledTimes(1);
  });

  it('closes the others one by one, and keeps the dialog with the reason when one is refused', async () => {
    const refused = refusal('INTERNAL_ERROR', 'common.error.unexpected');
    const { result, api } = mount({
      openFolders: [aTab(A), aTab(B), aTab(C)],
      close: (path) => (path === C ? refused : undefined),
    });
    await loaded(result, 3);

    act(() => {
      result.current.askClose([B, C]);
    });
    act(() => {
      result.current.confirmClose();
    });

    await waitFor(() => {
      expect(result.current.failure).toBe(refused);
    });
    expect(api.remove).toHaveBeenCalledTimes(2);
    expect(result.current.closing).toEqual([B, C]);
  });

  it('does nothing on "close" with no question asked', async () => {
    const { result, api } = mount({ openFolders: [aTab(A)] });
    await loaded(result, 1);

    act(() => {
      result.current.confirmClose();
    });

    expect(api.remove).not.toHaveBeenCalled();
  });
});

describe('moving folder tabs — plan 06, S-106, S-107', () => {
  it('moves one place, and the server keeps the new order', async () => {
    const server = aTabServer([aTab(A), aTab(B), aTab(C)]);
    const { result } = mount(server.routes);
    await loaded(result, 3);

    act(() => {
      result.current.move(A, 1);
    });

    await waitFor(() => {
      expect(result.current.tabs.map((tab) => tab.path)).toEqual([B, A, C]);
    });
    expect(server.paths()).toEqual([B, A, C]);
  });

  it('moves to where a drag let go', async () => {
    const server = aTabServer([aTab(A), aTab(B), aTab(C)]);
    const { result } = mount(server.routes);
    await loaded(result, 3);

    act(() => {
      result.current.moveTo(C, 0);
    });

    await waitFor(() => {
      expect(server.paths()).toEqual([C, A, B]);
    });
  });

  it('asks nothing for a tab that stays where it is, or one the server does not keep', async () => {
    const { result, api } = mount({ openFolders: [aTab(A), aTab(B)] }, '/srv/projects/new');
    await loaded(result, 2);

    act(() => {
      result.current.moveTo(A, 0);
      result.current.moveTo('/srv/projects/new', 0);
    });

    expect(api.put).not.toHaveBeenCalled();
  });

  it('says why when another window moved the tabs first, and shows them as they are now', async () => {
    const { result, api } = mount({
      openFolders: [aTab(A), aTab(B)],
      order: () => refusal('CONFLICT', 'workspace.error.openFoldersOrderConflict'),
    });
    await loaded(result, 2);
    api.get.mockClear();

    act(() => {
      result.current.move(A, 1);
    });

    await waitFor(() => {
      expect(result.current.failure).toMatchObject({ code: 'CONFLICT' });
    });
    expect(api.get).toHaveBeenCalledWith('/workspaces/open-folders');
  });

  it('reads the tabs again when the socket comes back from a drop — not on its first connect', async () => {
    let tell: (status: ConnectionStatus) => void = () => undefined;
    vi.spyOn(wsClient, 'onStatus').mockImplementation((watcher) => {
      tell = watcher;
      watcher('connecting');
      return () => undefined;
    });
    const { result, api } = mount({ openFolders: [aTab(A)] });
    await loaded(result, 1);
    api.get.mockClear();

    act(() => {
      tell('ready');
    });
    expect(api.get).not.toHaveBeenCalled();

    act(() => {
      tell('reconnecting');
    });
    act(() => {
      tell('ready');
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/workspaces/open-folders');
    });
  });
});
