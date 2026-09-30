import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { KeyboardEvent } from 'react';

import { useFolderBrowser } from '@/features/workspace/hooks/useFolderBrowser';
import type { FolderBrowser } from '@/features/workspace/hooks/useFolderBrowser';
import { providers } from '../../../../support/render';
import {
  aListing,
  fakeWorkspaceApi,
  projects,
  refusal,
  scratch,
} from '../../../../support/workspace-api';
import type { WorkspaceRoutes } from '../../../../support/workspace-api';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every folder of the fake disk, by path — each listed with the names given. */
const DISK: Record<string, readonly string[]> = {
  [projects.path]: ['app', 'docs', 'Downloads'],
  [`${projects.path}/app`]: ['src', 'test'],
  [`${projects.path}/app/src`]: [],
  [`${projects.path}/docs`]: [],
  [`${projects.path}/Downloads`]: [],
  [scratch.path]: ['tmp'],
};

const routes: WorkspaceRoutes = {
  roots: [scratch, projects],
  directories: (asked) => {
    const path = asked.get('path') ?? '';
    const names = (DISK[path] ?? []).concat(asked.get('hidden') === 'true' ? ['.git'] : []);
    return aListing(path.startsWith(scratch.path) ? scratch : projects, path, names);
  },
};

/** A key, as the listbox receives it. */
function key(name: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent<HTMLElement> {
  return {
    key: name,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...modifiers,
  } as unknown as KeyboardEvent<HTMLElement>;
}

async function browsing(startAt: typeof projects | null, fake: WorkspaceRoutes = routes) {
  const api = fakeWorkspaceApi(fake);
  const hook = renderHook(() => useFolderBrowser(startAt), { wrapper: providers() });
  await settled(hook.result);
  return { ...hook, api };
}

async function settled(result: { readonly current: FolderBrowser }): Promise<void> {
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });
}

function names(result: { readonly current: FolderBrowser }): string[] {
  return result.current.options.map((option) => option.name);
}

function press(
  result: { readonly current: FolderBrowser },
  event: KeyboardEvent<HTMLElement>,
): void {
  act(() => {
    result.current.onKeyDown(event);
  });
}

describe('where the dialog starts — S-72', () => {
  it('starts on the roots, with nothing to open yet', async () => {
    const { result } = await browsing(null);

    expect(result.current.crumbs).toEqual([]);
    expect(names(result)).toEqual(['Scratch', 'Projects']);
    expect(result.current.current).toBeNull();
    expect(result.current.active).toBe(0);
  });

  it('starts inside a root when one is given, and can open it as it is', async () => {
    const { result } = await browsing(projects);

    expect(result.current.crumbs).toEqual([{ path: projects.path, name: 'Projects' }]);
    expect(names(result)).toEqual(['app', 'docs', 'Downloads']);
    expect(result.current.current).toBe(projects.path);
  });
});

describe('walking the folders — S-72', () => {
  it('goes into a subfolder, and the crumbs follow', async () => {
    const { result } = await browsing(projects);

    act(() => {
      result.current.enter(result.current.options[0]!);
    });
    await settled(result);

    expect(result.current.crumbs.map((crumb) => crumb.name)).toEqual(['Projects', 'app']);
    expect(names(result)).toEqual(['src', 'test']);
    expect(result.current.current).toBe(`${projects.path}/app`);
  });

  it('goes back by a crumb, and never above the root — only to the roots', async () => {
    const { result } = await browsing(projects);
    act(() => {
      result.current.enter(result.current.options[0]!);
    });
    await settled(result);

    act(() => {
      result.current.goTo(0);
    });
    await settled(result);
    expect(result.current.crumbs).toHaveLength(1);

    act(() => {
      result.current.up();
    });
    expect(result.current.crumbs).toEqual([]);
    expect(names(result)).toEqual(['Scratch', 'Projects']);

    // On the roots there is nowhere further up.
    act(() => {
      result.current.up();
      result.current.goTo(-5);
    });
    expect(result.current.crumbs).toEqual([]);
  });

  it('opens the folder the server listed — the real one, when a link led there — S-78', async () => {
    const { result } = await browsing(projects, {
      ...routes,
      directories: (asked) =>
        asked.get('path') === `${projects.path}/link`
          ? aListing(projects, `${projects.path}/real`, [])
          : aListing(projects, projects.path, ['link'], { symlinks: ['link'] }),
    });

    expect(result.current.options[0]?.symlink).toBe(true);
    act(() => {
      result.current.enter(result.current.options[0]!);
    });
    await settled(result);

    expect(result.current.current).toBe(`${projects.path}/real`);
  });
});

describe('the keyboard — S-73', () => {
  it('walks the options with the arrows, Home and End, and never past either end', async () => {
    const { result } = await browsing(projects);

    press(result, key('ArrowDown'));
    expect(result.current.active).toBe(1);
    press(result, key('End'));
    press(result, key('ArrowDown'));
    expect(result.current.active).toBe(2);
    press(result, key('Home'));
    press(result, key('ArrowUp'));
    expect(result.current.active).toBe(0);
  });

  it('goes in with Enter, and up with Backspace or Alt+↑', async () => {
    const { result } = await browsing(projects);

    press(result, key('Enter'));
    await settled(result);
    expect(result.current.crumbs.at(-1)?.name).toBe('app');

    press(result, key('Backspace'));
    await settled(result);
    expect(result.current.crumbs.at(-1)?.name).toBe('Projects');

    press(result, key('ArrowUp', { altKey: true }));
    expect(result.current.crumbs).toEqual([]);
  });

  it('narrows by prefix as it is typed, ignoring case, and Backspace takes a letter back', async () => {
    const { result } = await browsing(projects);

    press(result, key('d'));
    expect(names(result)).toEqual(['docs', 'Downloads']);
    press(result, key('o'));
    press(result, key('w'));
    expect(names(result)).toEqual(['Downloads']);
    expect(result.current.filter).toBe('dow');

    press(result, key('Backspace'));
    expect(result.current.filter).toBe('do');
    expect(result.current.crumbs).toHaveLength(1);
  });

  it('says a filter matched nothing, rather than that the folder is empty', async () => {
    const { result } = await browsing(projects);

    press(result, key('z'));

    expect(result.current.options).toEqual([]);
    expect(result.current.active).toBe(-1);
    expect(result.current.isEmpty).toBe(false);

    // Enter on nothing goes nowhere.
    press(result, key('Enter'));
    expect(result.current.crumbs).toHaveLength(1);
  });

  it('leaves alone what is not its business — Tab, and shortcuts', async () => {
    const { result } = await browsing(projects);
    const tab = key('Tab');
    const copy = key('c', { ctrlKey: true });

    press(result, tab);
    press(result, copy);

    expect(tab.preventDefault).not.toHaveBeenCalled();
    expect(copy.preventDefault).not.toHaveBeenCalled();
    expect(result.current.filter).toBe('');
  });

  it('clears the filter on entering another folder', async () => {
    const { result } = await browsing(projects);
    act(() => {
      result.current.setFilter('a');
      result.current.setActive(0);
    });

    press(result, key('Enter'));
    await settled(result);

    expect(result.current.filter).toBe('');
    expect(names(result)).toEqual(['src', 'test']);
  });
});

describe('what a listing can say', () => {
  it('asks again with the dot-folders when they are to be shown — S-74', async () => {
    const { result, api } = await browsing(projects);

    act(() => {
      result.current.setShowHidden(true);
    });
    await settled(result);

    expect(names(result)).toContain('.git');
    expect(api.get.mock.calls.some(([path]) => String(path).includes('hidden=true'))).toBe(true);
  });

  it('sends the filter to the server once the listing was cut at the ceiling — S-75', async () => {
    const { result, api } = await browsing(projects, {
      ...routes,
      directories: (asked) =>
        asked.get('prefix') === null
          ? aListing(projects, projects.path, ['a1', 'a2'], { truncated: true })
          : aListing(projects, projects.path, ['zeta']),
    });

    expect(result.current.truncated).toBe(true);
    press(result, key('z'));
    await settled(result);

    expect(names(result)).toEqual(['zeta']);
    expect(api.get.mock.calls.some(([path]) => String(path).includes('prefix=z'))).toBe(true);
  });

  it('matches locally while the listing is whole, asking the server nothing more', async () => {
    const { result, api } = await browsing(projects);
    const asked = api.get.mock.calls.length;

    press(result, key('a'));

    expect(names(result)).toEqual(['app']);
    expect(api.get.mock.calls).toHaveLength(asked);
  });

  it('says a folder with no subfolders is empty — S-76', async () => {
    const { result } = await browsing(projects);
    act(() => {
      result.current.enter(result.current.options[1]!);
    });
    await settled(result);

    expect(result.current.isEmpty).toBe(true);
    expect(result.current.current).toBe(`${projects.path}/docs`);
  });

  it('keeps the refusal of a folder it cannot read, and can still go up — S-76', async () => {
    const unreadable = refusal(
      'WORKSPACE_DIRECTORY_UNREADABLE',
      'workspace.error.directoryUnreadable',
    );
    const { result } = await browsing(projects, {
      ...routes,
      directories: (asked) =>
        asked.get('path') === projects.path
          ? aListing(projects, projects.path, ['locked'])
          : unreadable,
    });

    act(() => {
      result.current.enter(result.current.options[0]!);
    });
    await settled(result);

    expect(result.current.error).toBe(unreadable);
    expect(result.current.isEmpty).toBe(false);
    // Nothing listed, so "Open" opens the folder as the crumb named it.
    expect(result.current.current).toBe(`${projects.path}/locked`);

    press(result, key('Backspace'));
    await settled(result);
    expect(result.current.error).toBeNull();
  });

  it('keeps the refusal of the roots, and reads them again on reload', async () => {
    const offline = refusal('NETWORK_UNREACHABLE', 'common.error.offline');
    const { result, api } = await browsing(null, { roots: offline });

    expect(result.current.error).toBe(offline);
    act(() => {
      result.current.reload();
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });

  it('says there are no roots at all when there are none', async () => {
    const { result } = await browsing(null, { roots: [] });

    expect(result.current.isEmpty).toBe(true);
  });
});
