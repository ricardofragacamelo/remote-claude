import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { candidateOf, targetsOf, useExplorer } from '@/features/explorer/hooks/useExplorer';
import type { EntryRow, TreeRow } from '@/features/explorer/lib/tree-rows';
import { explorerStore, forgetExplorer } from '@/features/explorer/store/explorer.store';
import { AppError } from '@/shared/api/errors';
import { claudeContextTargets } from '@/shared/lib/files-drag';
import { editorFake, resetEditorFake } from '../../../../support/editor-fake';
import { FakeFolder } from '../../../../support/files-api';
import type { FakeEntry } from '../../../../support/files-api';
import { providers } from '../../../../support/render';

vi.mock(
  '@/features/editor',
  async () => (await import('../../../../support/editor-fake')).editorFake,
);

const APP = '/srv/app';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetEditorFake();
  forgetExplorer(null);
});

async function explorerOver(tree: Record<string, FakeEntry | string>) {
  const disk = new FakeFolder(APP, tree).install();
  const hook = renderHook(() => useExplorer(APP), { wrapper: providers() });
  await waitFor(() => {
    expect(hook.result.current.tree.root.status).toBe('ready');
  });
  return { disk, ...hook };
}

function entryRow(rows: readonly TreeRow[], path: string): EntryRow {
  const found = rows.find((row): row is EntryRow => row.type === 'entry' && row.path === path);
  if (found === undefined) {
    throw new Error(`no row ${path}`);
  }
  return found;
}

describe('with nothing to act on, nothing happens', () => {
  it('sends nothing and changes nothing', async () => {
    const { result, disk } = await explorerOver({ 'a.ts': 'a' });
    const before = explorerStore(APP).getState();

    act(() => {
      result.current.remove();
      result.current.copy('copy');
      result.current.paste();
      result.current.duplicate();
      result.current.askMove();
      result.current.rename();
      result.current.newFromFile();
      result.current.copyPath(true);
      result.current.openToSide();
      result.current.compare();
      result.current.addToContext();
      result.current.moveInto([], 'lib');
    });

    expect(result.current.targets).toEqual([]);
    expect(result.current.moving).toBeNull();
    expect(result.current.deletion.current).toBeNull();
    expect(explorerStore(APP).getState().clipboard).toBe(before.clipboard);
    expect(disk.calls.filter((call) => call.method !== 'GET')).toEqual([]);
    expect(editorFake.openFile).not.toHaveBeenCalled();
    expect(editorFake.openDiff).not.toHaveBeenCalled();
  });

  it('does not rename, open beside or start from a link out of the folder', async () => {
    const { result } = await explorerOver({ out: { kind: 'symlink', outside: true }, 'b.ts': 'b' });
    act(() => {
      explorerStore(APP).getState().select(['out'], 'out');
    });

    act(() => {
      result.current.rename();
      result.current.openToSide();
      result.current.newFromFile();
      result.current.open(entryRow(result.current.tree.rows, 'out'));
    });

    expect(explorerStore(APP).getState().renaming).toBeNull();
    expect(explorerStore(APP).getState().creating).toBeNull();
    expect(editorFake.openFile).not.toHaveBeenCalled();
  });
});

describe('opening a row', () => {
  it('opens a link to a file as the file, and reads a failed level again', async () => {
    const { result, disk } = await explorerOver({
      link: { kind: 'symlink', targetKind: 'file' },
      other: { kind: 'symlink', targetKind: 'missing' },
    });

    act(() => {
      result.current.open(entryRow(result.current.tree.rows, 'link'), { preview: true });
      result.current.open(entryRow(result.current.tree.rows, 'other'));
      result.current.open({
        type: 'error',
        key: 'x',
        parent: '',
        level: 1,
        error: new AppError('X', 'x', 't'),
      });
      result.current.open({ type: 'loading', key: 'y', parent: '', level: 1 });
    });

    expect(editorFake.openFile).toHaveBeenCalledTimes(1);
    expect(editorFake.openFile).toHaveBeenCalledWith(APP, 'link', { preview: true });
    await waitFor(() => {
      expect(disk.callsTo('GET', '/files/tree').length).toBe(2);
    });
  });
});

describe('the small decisions of the actions', () => {
  it('starts a template with no suggestion for one this version lacks', async () => {
    const { result } = await explorerOver({});

    act(() => {
      result.current.newEntry('file', 'cobol');
    });

    expect(explorerStore(APP).getState().creating).toMatchObject({
      initialName: '',
      template: 'cobol',
    });
  });

  it('cuts aside, and says so', async () => {
    const { result } = await explorerOver({ 'a.ts': 'a' });
    act(() => {
      explorerStore(APP).getState().select(['a.ts'], 'a.ts');
    });

    act(() => {
      result.current.copy('cut');
    });

    expect(explorerStore(APP).getState().announcement?.key).toBe('explorer.done.cutAside');
  });

  it('says when the browser refuses to copy a path', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const { result } = await explorerOver({ 'a.ts': 'a' });
    act(() => {
      explorerStore(APP).getState().select(['a.ts'], 'a.ts');
    });

    act(() => {
      result.current.copyPath(false);
    });

    await waitFor(() => {
      expect(explorerStore(APP).getState().announcement?.key).toBe('explorer.done.copyFailed');
    });
  });

  it("hands Claude's context only what can be acted on, and says what it left out", async () => {
    const add = vi.fn();
    const { result } = await explorerOver({
      'a.ts': 'a',
      out: { kind: 'symlink', outside: true },
    });
    act(() => {
      explorerStore(APP).getState().select(['a.ts', 'out'], 'a.ts');
    });

    act(() => {
      result.current.addToContext();
    });
    expect(explorerStore(APP).getState().announcement?.key).toBe('explorer.context.excluded');

    const unregister = claudeContextTargets.register({ id: 'panel', position: 1, add });
    try {
      act(() => {
        result.current.addToContext();
      });
      expect(add).toHaveBeenCalledWith({ folder: APP, entries: [{ path: 'a.ts', kind: 'file' }] });
    } finally {
      unregister();
    }
  });

  it('knows the folders read so far, never a name that is not text', async () => {
    const { result } = await explorerOver({
      lib: { kind: 'directory' },
      bad: { kind: 'directory', unreadableName: true },
      'a.ts': 'a',
    });

    expect(result.current.knownFolders()).toEqual(['', 'lib']);
  });
});

describe('what the actions act on', () => {
  const row = (path: string, extra: Partial<EntryRow['entry']> = {}): EntryRow => ({
    type: 'entry',
    key: path,
    path,
    head: path,
    entry: {
      name: path,
      path,
      kind: 'file',
      size: 0,
      mtime: '',
      hidden: false,
      unreadableName: false,
      outside: false,
      targetKind: null,
      ...extra,
    },
    names: [path],
    parent: '',
    level: 1,
    setSize: 1,
    posInSet: 1,
    expandable: false,
    expanded: false,
    renaming: false,
  });

  it('takes the selection in the order of the tree, or else the focused row', () => {
    const rows = [row('a'), row('b'), row('c')];

    expect(targetsOf(rows, ['c', 'a'], 'b').map((each) => each.path)).toEqual(['a', 'c']);
    expect(targetsOf(rows, [], 'b').map((each) => each.path)).toEqual(['b']);
    expect(targetsOf(rows, [], null)).toEqual([]);
  });

  it('marks what cannot go to Claude, and why', () => {
    expect(candidateOf(row('u', { unreadableName: true }))).toEqual({
      path: 'u',
      kind: 'file',
      inoperable: 'unreadableName',
    });
    expect(candidateOf(row('o', { outside: true })).inoperable).toBe('outsideLink');
    expect(candidateOf({ ...row('d'), expandable: true })).toEqual({
      path: 'd',
      kind: 'directory',
    });
  });
});
