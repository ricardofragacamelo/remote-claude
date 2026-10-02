import { afterEach, describe, expect, it } from 'vitest';

import { explorerStore, forgetExplorer } from '@/features/explorer/store/explorer.store';

const APP = '/srv/app';
const PKG = '/srv/app/pkg';

afterEach(() => {
  forgetExplorer(null);
});

describe('one Explorer per folder tab — S-12', () => {
  it('makes one store per folder, and two folders share nothing', () => {
    explorerStore(APP).getState().expand('src');
    explorerStore(APP).getState().select(['src'], 'src');

    expect(explorerStore(APP)).toBe(explorerStore(APP));
    expect(explorerStore(PKG).getState().expanded.has('src')).toBe(false);
    expect(explorerStore(PKG).getState().selection).toEqual([]);
  });

  it('forgets one folder, or every one', () => {
    const app = explorerStore(APP);
    const pkg = explorerStore(PKG);

    forgetExplorer(APP);
    expect(explorerStore(APP)).not.toBe(app);
    expect(explorerStore(PKG)).toBe(pkg);

    forgetExplorer(null);
    expect(explorerStore(PKG)).not.toBe(pkg);
  });
});

describe('what the store does', () => {
  it('opens and closes folders — the folder itself always open — and collapses all', () => {
    const store = explorerStore(APP).getState();

    store.toggle('src');
    expect(explorerStore(APP).getState().expanded.has('src')).toBe(true);
    explorerStore(APP).getState().toggle('src');
    expect(explorerStore(APP).getState().expanded.has('src')).toBe(false);
    explorerStore(APP).getState().expand('lib');
    explorerStore(APP).getState().collapseAll();
    expect([...explorerStore(APP).getState().expanded]).toEqual(['']);
  });

  it('selects without repeats, and keeps the anchor unless told', () => {
    const store = explorerStore(APP);

    store.getState().select(['a', 'a', 'b'], 'b');
    expect(store.getState()).toMatchObject({ selection: ['a', 'b'], focused: 'b', anchor: 'b' });
    store.getState().select(['c'], null);
    expect(store.getState().anchor).toBe('b');
    store.getState().select(['c'], 'c', 'a');
    expect(store.getState().anchor).toBe('a');
    store.getState().setFocused('z');
    expect(store.getState().focused).toBe('z');
  });

  it('names in place one entry at a time, and opens the folder a new one goes in', () => {
    const store = explorerStore(APP);

    store.getState().startRenaming('a.ts');
    store.getState().startCreating({
      parent: 'src/deep',
      kind: 'file',
      initialName: '',
      template: null,
      source: null,
    });
    expect(store.getState().renaming).toBeNull();
    expect([...store.getState().expanded]).toEqual(expect.arrayContaining(['src', 'src/deep']));

    store.getState().startRenaming('b.ts');
    expect(store.getState().creating).toBeNull();
    store.getState().stopEditing();
    expect(store.getState().renaming).toBeNull();
  });

  it('undoes the last first, and answers nothing when there is nothing — S-186', () => {
    const store = explorerStore(APP);

    expect(store.getState().popUndo()).toBeNull();
    store.getState().pushUndo({ kind: 'create', items: [{ path: 'a', etag: null }] });
    store.getState().pushUndo({ kind: 'copy', items: [{ path: 'b', etag: null }] });

    expect(store.getState().popUndo()?.kind).toBe('copy');
    expect(store.getState().undo).toHaveLength(1);
  });

  it('reveals an entry: opens what is above it, selects it, clears the filter, asks for the focus', () => {
    const store = explorerStore(APP);
    store.getState().setFilter('x');

    store.getState().reveal('a/b/c.ts');

    expect(store.getState()).toMatchObject({
      selection: ['a/b/c.ts'],
      focused: 'a/b/c.ts',
      filter: '',
      focusRequest: 1,
    });
    expect([...store.getState().expanded]).toEqual(expect.arrayContaining(['a', 'a/b']));
  });

  it('follows a move with what was open, selected and focused under it', () => {
    const store = explorerStore(APP);
    store.getState().expand('src');
    store.getState().expand('src/deep');
    store.getState().select(['src/a.ts', 'other.ts'], 'src/a.ts', 'src');

    store.getState().moved('src', 'lib');

    expect([...store.getState().expanded]).toEqual(['', 'lib', 'lib/deep']);
    expect(store.getState()).toMatchObject({
      selection: ['lib/a.ts', 'other.ts'],
      focused: 'lib/a.ts',
      anchor: 'lib',
    });
    store.getState().select([], null, null);
    store.getState().moved('x', 'y');
    expect(store.getState().focused).toBeNull();
  });

  it('keeps the options, the clipboard, the watch, and what is announced — twice the same, twice told', () => {
    const store = explorerStore(APP);

    store.getState().setShowHidden(true);
    store.getState().setSort('type');
    store.getState().setCompact(false);
    store.getState().setClipboard({ mode: 'cut', paths: ['a'] });
    store.getState().setWatch({ state: 'unavailable', code: 'WATCH_UNAVAILABLE' });
    store.getState().reload();
    store.getState().requestFocus();
    store.getState().requestFilter();
    store.getState().announce('explorer.done.undone');
    const first = store.getState().announcement?.id;
    store.getState().announce('explorer.done.undone');

    expect(store.getState()).toMatchObject({
      showHidden: true,
      sort: 'type',
      compact: false,
      clipboard: { mode: 'cut', paths: ['a'] },
      watch: { state: 'unavailable', code: 'WATCH_UNAVAILABLE' },
      reloads: 1,
      focusRequest: 1,
      filterRequest: 1,
    });
    expect(store.getState().announcement).toMatchObject({
      key: 'explorer.done.undone',
      params: {},
    });
    expect(store.getState().announcement?.id).not.toBe(first);
  });
});
