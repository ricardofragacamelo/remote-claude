import { describe, expect, it, vi } from 'vitest';

import {
  folderTabStore,
  forgetFolderTab,
  forgetFolderTabs,
  keptLayoutFrom,
  releaseFolderTabs,
} from '@/features/workbench/store/folder-tab.store';
import { forgetTab, pruneTabs, restoreTab } from '@/features/workbench/store/tab-state';
import type { TabRestorer } from '@/features/workbench';
import { INITIAL_LAYOUT } from '@/features/workbench/hooks/workbench-layout';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';

const A = '/srv/projects/a';
const B = '/srv/projects/b';
const KEY = `${VISITOR_PREFIX}workbench.tabState`;

function kept(): {
  format: number;
  tabs: Record<string, Record<string, { version: number; state: unknown }>>;
} {
  return JSON.parse(localStorage.getItem(KEY) ?? 'null');
}

function keep(tabs: Record<string, unknown>, format = 1): void {
  localStorage.setItem(KEY, JSON.stringify({ format, tabs }));
}

describe('what a reload gives a tab back — plan 06, S-134', () => {
  it('keeps the layout of each tab as it changes, by the real path', () => {
    folderTabStore(A).getState().pickView('search');
    folderTabStore(A).getState().togglePanel();
    folderTabStore(A).getState().resize({ sideBar: 30 });
    folderTabStore(B).getState().showMobile('editor');

    expect(kept().tabs[A]?.['workbench.layout']).toEqual({
      version: 1,
      state: {
        view: 'search',
        sideBarOpen: true,
        panelOpen: true,
        mobileView: 'claude',
        sizes: { ...INITIAL_LAYOUT, sideBar: 30 },
      },
    });
    expect(kept().tabs[B]?.['workbench.layout']?.state).toMatchObject({ mobileView: 'editor' });
  });

  it('gives it back when the page loads again — before anything of the tab is on screen', () => {
    folderTabStore(A).getState().pickView('sessions');
    folderTabStore(A).getState().toggleSideBar();

    releaseFolderTabs();

    expect(folderTabStore(A).getState()).toMatchObject({ view: 'sessions', sideBarOpen: false });
  });

  it('writes nothing for what it does not keep — a prompt being typed, a session picked', () => {
    folderTabStore(A).getState().togglePanel();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    folderTabStore(A).getState().setDraft('half a prompt');
    folderTabStore(A).getState().showSession('ses_1');

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('gives back what a later plan registers — the open editors of plan 07', () => {
    let editors: readonly string[] = [];
    const listeners = new Set<() => void>();
    const restorer: TabRestorer<readonly string[]> = {
      id: 'editor.open',
      position: 200,
      version: 3,
      parse: (value) => (Array.isArray(value) ? (value as string[]) : undefined),
      capture: () => editors,
      apply: (_, value) => {
        editors = value;
      },
      subscribe: (_, listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    keep({ [A]: { 'editor.open': { version: 3, state: ['README.md'] } } });

    restoreTab(A, [restorer as TabRestorer]);
    expect(editors).toEqual(['README.md']);

    editors = ['README.md', 'package.json'];
    for (const listener of listeners) listener();
    expect(kept().tabs[A]?.['editor.open']).toEqual({ version: 3, state: editors });

    restoreTab(A, [restorer as TabRestorer]);
    expect(listeners.size).toBe(1);
    forgetTab(A, { kept: false });
    expect(listeners.size).toBe(0);
  });
});

describe('what cannot be trusted — plan 06, S-135', () => {
  it.each([
    [
      'another version of the part',
      { [A]: { 'workbench.layout': { version: 0, state: { view: 'search' } } } },
      1,
    ],
    [
      'another format of the record',
      { [A]: { 'workbench.layout': { version: 1, state: { view: 'search' } } } },
      7,
    ],
    ['a part that is not one', { [A]: { 'workbench.layout': 'search' } }, 1],
    ['a tab that is not one', { [A]: 'search' }, 1],
  ])('is %s, and the tab starts from the default, with no error', (_, tabs, format) => {
    keep(tabs, format);

    expect(folderTabStore(A).getState().view).toBe('explorer');
  });

  it('is a record that is not JSON, and the tab starts from the default', () => {
    localStorage.setItem(KEY, '{not json');

    expect(folderTabStore(A).getState()).toMatchObject({ view: 'explorer', panelOpen: false });
  });

  it('reads each part of a kept layout on its own — a bad one is its default, the others stay', () => {
    expect(
      keptLayoutFrom({
        view: 7,
        sideBarOpen: 'no',
        panelOpen: true,
        mobileView: 'tv',
        sizes: null,
      }),
    ).toEqual({
      view: 'explorer',
      sideBarOpen: true,
      panelOpen: true,
      mobileView: 'claude',
      sizes: INITIAL_LAYOUT,
    });
    expect(keptLayoutFrom('wide')).toBeUndefined();
  });

  it('drops what a folder no longer open kept, once the tabs are read, and keeps the rest', () => {
    folderTabStore(A).getState().togglePanel();
    folderTabStore(B).getState().togglePanel();

    pruneTabs([B]);

    expect(Object.keys(kept().tabs)).toEqual([B]);
  });

  it('writes nothing when every folder kept is still open', () => {
    folderTabStore(A).getState().togglePanel();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    pruneTabs([A, B]);

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe('what a tab kept, forgotten — plan 06, S-196', () => {
  it('goes with the tab that is closed: opened again, it starts over', () => {
    folderTabStore(A).getState().pickView('search');
    folderTabStore(B).getState().pickView('search');

    forgetFolderTab(A);

    expect(Object.keys(kept().tabs)).toEqual([B]);
    expect(folderTabStore(A).getState().view).toBe('explorer');
  });

  it('writes nothing when the closed tab had kept nothing', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    forgetTab('/never/opened');

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('goes for every tab when somebody signs out: the next person starts from nothing (S-191)', () => {
    folderTabStore(A).getState().pickView('search');

    forgetFolderTabs();

    expect(kept().tabs).toEqual({});
    folderTabStore(A).getState().togglePanel();
    releaseFolderTabs();
    expect(folderTabStore(A).getState().view).toBe('explorer');
  });
});
