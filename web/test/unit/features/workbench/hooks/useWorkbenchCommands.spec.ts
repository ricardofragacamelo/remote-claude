import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { commandRegistry } from '@/features/commands';
import type { FolderTabs } from '@/features/workbench/hooks/useFolderTabs';
import { useWorkbenchCommands } from '@/features/workbench/hooks/useWorkbenchCommands';
import { folderTabStore } from '@/features/workbench/store/folder-tab.store';
import type { FolderTab } from '@/features/workbench';

const A = '/srv/projects/a';
const B = '/srv/projects/b';

function aTab(path: string): FolderTab {
  return {
    path,
    name: path.split('/').at(-1) ?? path,
    rootLabel: 'Projects',
    state: 'available',
    kept: true,
  };
}

function aControl(tabs: readonly FolderTab[], active: string): FolderTabs {
  return {
    tabs,
    active,
    current: tabs[0] ?? aTab(active),
    isLoading: false,
    error: null,
    reload: vi.fn(),
    activate: vi.fn(),
    closing: null,
    askClose: vi.fn(),
    cancelClose: vi.fn(),
    confirmClose: vi.fn(),
    isClosing: false,
    failure: null,
    move: vi.fn(),
    moveTo: vi.fn(),
  };
}

function run(id: string): void {
  void commandRegistry.command(id)?.run();
}

describe('the commands of the folder tabs — plan 06, B-23', () => {
  it('go round the tabs, and to a tab by its place', () => {
    const control = aControl([aTab(A), aTab(B)], B);
    renderHook(() => {
      useWorkbenchCommands(control);
    });

    run('workbench.nextFolderTab');
    run('workbench.previousFolderTab');
    run('workbench.folderTab1');

    expect(control.activate).toHaveBeenNthCalledWith(1, A);
    expect(control.activate).toHaveBeenNthCalledWith(2, A);
    expect(control.activate).toHaveBeenNthCalledWith(3, A);
    expect(commandRegistry.command('workbench.folderTab2')?.when?.()).toBe(true);
    expect(commandRegistry.command('workbench.folderTab3')?.when?.()).toBe(false);
  });

  it('go nowhere for a place with no tab, even run by name', () => {
    const control = aControl([aTab(A)], A);
    renderHook(() => {
      useWorkbenchCommands(control);
    });

    run('workbench.folderTab5');
    run('workbench.nextFolderTab');

    expect(control.activate).toHaveBeenCalledTimes(1);
    expect(control.activate).toHaveBeenCalledWith(A);
    expect(commandRegistry.command('workbench.nextFolderTab')?.when?.()).toBe(false);
  });

  it('stay on the tab on screen when the set is not known yet', () => {
    const control = aControl([], A);
    renderHook(() => {
      useWorkbenchCommands(control);
    });

    run('workbench.nextFolderTab');

    expect(control.activate).toHaveBeenCalledWith(A);
  });

  it('close the tab on screen — asking first — and open and close its parts', () => {
    const control = aControl([aTab(A), aTab(B)], A);
    renderHook(() => {
      useWorkbenchCommands(control);
    });

    run('workbench.closeFolderTab');
    run('workbench.toggleSideBar');
    run('workbench.togglePanel');

    expect(control.askClose).toHaveBeenCalledWith([A]);
    expect(folderTabStore(A).getState()).toMatchObject({ sideBarOpen: false, panelOpen: true });
  });

  it('are gone once the workbench is', () => {
    const { unmount } = renderHook(() => {
      useWorkbenchCommands(aControl([aTab(A)], A));
    });

    unmount();

    expect(commandRegistry.command('workbench.closeFolderTab')).toBeUndefined();
  });
});
