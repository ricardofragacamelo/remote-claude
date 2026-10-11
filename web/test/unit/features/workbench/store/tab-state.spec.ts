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
        secondaryOpen: true,
        panelOpen: true,
        mobileView: 'agent',
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

  it('writes nothing for what it does not keep — a session picked, a link refused', () => {
    folderTabStore(A).getState().togglePanel();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    folderTabStore(A).getState().showSession('ses_1');
    folderTabStore(A).getState().refuseLink();

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

describe('what a part kept under the id it had before — plan 28, B-39', () => {
  /** A part renamed: kept as `old.part` by an older build, `new.part` from now on. */
  function renamedPart() {
    let applied: string | null = null;
    let changed = (): void => undefined;
    const restorer: TabRestorer<string> = {
      id: 'new.part',
      formerIds: ['old.part'],
      position: 1,
      version: 1,
      parse: (value) => (typeof value === 'string' ? value : undefined),
      capture: () => applied ?? 'nothing',
      apply: (_, value) => {
        applied = value;
      },
      subscribe: (_, listener) => {
        changed = listener;
        return () => undefined;
      },
    };
    return { restorer, applied: () => applied, changed: () => changed() };
  }

  it('is given back, and kept under the new id from then on — read once', () => {
    keep({ [A]: { 'old.part': { version: 1, state: 'kept' } } });
    const part = renamedPart();

    restoreTab(A, [part.restorer as TabRestorer]);
    expect(part.applied()).toBe('kept');

    part.changed();
    expect(kept().tabs[A]).toEqual({ 'new.part': { version: 1, state: 'kept' } });
    forgetTab(A, { kept: false });
  });

  it('gives way to what is kept under the new id', () => {
    keep({
      [A]: {
        'old.part': { version: 1, state: 'older' },
        'new.part': { version: 1, state: 'newer' },
      },
    });
    const part = renamedPart();

    restoreTab(A, [part.restorer as TabRestorer]);

    expect(part.applied()).toBe('newer');
    forgetTab(A, { kept: false });
  });

  it('is nothing when neither id kept anything', () => {
    keep({ [A]: { 'other.part': { version: 1, state: 'x' } } });
    const part = renamedPart();

    restoreTab(A, [part.restorer as TabRestorer]);

    expect(part.applied()).toBeNull();
    forgetTab(A, { kept: false });
  });

  it('reads the view of the one-view layout an older build named after one engine as the agent’s', () => {
    expect(keptLayoutFrom({ mobileView: 'claude' })?.mobileView).toBe('agent');
    expect(keptLayoutFrom({ mobileView: 'agent' })?.mobileView).toBe('agent');
    expect(keptLayoutFrom({ mobileView: 'editor' })?.mobileView).toBe('editor');
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
        secondaryOpen: 'no',
        panelOpen: true,
        mobileView: 'tv',
        sizes: null,
      }),
    ).toEqual({
      view: 'explorer',
      sideBarOpen: true,
      secondaryOpen: true,
      panelOpen: true,
      mobileView: 'agent',
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
