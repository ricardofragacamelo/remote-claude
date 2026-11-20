import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SEARCH_PREFERENCES,
  useSearchPreferences,
} from '@/features/search/store/search-preferences.store';
import {
  forgetSearchView,
  isDismissed,
  searchViewStore,
  SEARCH_HISTORY_LIMIT,
} from '@/features/search/store/search-view.store';

afterEach(() => {
  useSearchPreferences.setState({ preferences: DEFAULT_SEARCH_PREFERENCES });
});

describe('searchViewStore — plan 11, B-15', () => {
  it('is one store per folder, kept across asks, dropped when the tab is forgotten', () => {
    const a = searchViewStore('/srv/projects/a');
    const b = searchViewStore('/srv/projects/b');
    expect(searchViewStore('/srv/projects/a')).toBe(a);
    expect(a).not.toBe(b);

    a.getState().setQuery('TODO');
    expect(searchViewStore('/srv/projects/a').getState().query).toBe('TODO');

    forgetSearchView('/srv/projects/a');
    expect(searchViewStore('/srv/projects/a').getState().query).toBe('');
  });

  it('starts every file expanded, with nothing dismissed or stale', () => {
    const store = searchViewStore('/srv/projects/c');

    expect(store.getState()).toMatchObject({
      collapsed: new Set(),
      dismissed: new Set(),
      stale: new Set(),
      useIgnoreFiles: true,
      onlyOpenEditors: false,
      replaceOpen: false,
      replacement: '',
      preserveCase: false,
    });
  });

  it('toggles one file collapsed, independent of the others', () => {
    const store = searchViewStore('/srv/projects/d');

    store.getState().toggleCollapsed('a.ts');
    expect(store.getState().collapsed).toEqual(new Set(['a.ts']));

    store.getState().toggleCollapsed('a.ts');
    expect(store.getState().collapsed).toEqual(new Set());
  });

  it('collapses every file named, and expands all of them back at once', () => {
    const store = searchViewStore('/srv/projects/e');

    store.getState().collapseAll(['a.ts', 'b.ts']);
    expect(store.getState().collapsed).toEqual(new Set(['a.ts', 'b.ts']));

    store.getState().expandAll();
    expect(store.getState().collapsed).toEqual(new Set());
  });

  it('dismisses a whole file, or one match of it, each its own entry', () => {
    const store = searchViewStore('/srv/projects/f');

    store.getState().dismissFile('a.ts');
    store.getState().dismissMatch('b.ts', 2, 3);

    expect(isDismissed(store.getState().dismissed, 'a.ts')).toBe(true);
    expect(isDismissed(store.getState().dismissed, 'b.ts', 2, 3)).toBe(true);
    expect(isDismissed(store.getState().dismissed, 'b.ts', 5, 1)).toBe(false);
    expect(isDismissed(store.getState().dismissed, 'c.ts')).toBe(false);
  });

  it('marks files stale one at a time, and clears every one of them at once', () => {
    const store = searchViewStore('/srv/projects/g');

    store.getState().markStale('a.ts');
    store.getState().markStale('b.ts');
    expect(store.getState().stale).toEqual(new Set(['a.ts', 'b.ts']));

    store.getState().clearStale();
    expect(store.getState().stale).toEqual(new Set());
  });

  it('sets every flag and filter field, one at a time', () => {
    const store = searchViewStore('/srv/projects/h');

    store.getState().setIsRegex(true);
    store.getState().setCaseSensitive(true);
    store.getState().setWholeWord(true);
    store.getState().setInclude('*.ts');
    store.getState().setExclude('*.spec.ts');
    store.getState().setUseIgnoreFiles(false);
    store.getState().setOnlyOpenEditors(true);

    expect(store.getState()).toMatchObject({
      isRegex: true,
      caseSensitive: true,
      wholeWord: true,
      include: '*.ts',
      exclude: '*.spec.ts',
      useIgnoreFiles: false,
      onlyOpenEditors: true,
    });
  });

  it('opens the replace row, sets what it replaces with, and preserve case — plan 11, B-16', () => {
    const store = searchViewStore('/srv/projects/i');

    store.getState().setReplaceOpen(true);
    store.getState().setReplacement('fixed');
    store.getState().setPreserveCase(true);

    expect(store.getState()).toMatchObject({
      replaceOpen: true,
      replacement: 'fixed',
      preserveCase: true,
    });
  });

  it('pushes a query to the front of the history — plan 11, B-18, S-136', () => {
    const store = searchViewStore('/srv/projects/j');

    store.getState().pushHistory('TODO');
    store.getState().pushHistory('FIXME');

    expect(store.getState().history).toEqual(['FIXME', 'TODO']);
  });

  it('never pushes an empty query', () => {
    const store = searchViewStore('/srv/projects/k');

    store.getState().pushHistory('');

    expect(store.getState().history).toEqual([]);
  });

  it('never keeps a query right after itself twice', () => {
    const store = searchViewStore('/srv/projects/l');

    store.getState().pushHistory('TODO');
    store.getState().pushHistory('TODO');

    expect(store.getState().history).toEqual(['TODO']);
  });

  it('keeps a query repeated later, once each time, not collapsed into one', () => {
    const store = searchViewStore('/srv/projects/m');

    store.getState().pushHistory('TODO');
    store.getState().pushHistory('FIXME');
    store.getState().pushHistory('TODO');

    expect(store.getState().history).toEqual(['TODO', 'FIXME', 'TODO']);
  });

  it('drops the oldest entry once the history passes its own ceiling', () => {
    const store = searchViewStore('/srv/projects/n');

    for (let i = 0; i < SEARCH_HISTORY_LIMIT + 1; i += 1) {
      store.getState().pushHistory(`q${String(i)}`);
    }

    expect(store.getState().history).toHaveLength(SEARCH_HISTORY_LIMIT);
    expect(store.getState().history[0]).toBe(`q${String(SEARCH_HISTORY_LIMIT)}`);
    expect(store.getState().history).not.toContain('q0');
  });

  it('empties the history — "Limpar histórico" (S-138)', () => {
    const store = searchViewStore('/srv/projects/o');
    store.getState().pushHistory('TODO');

    store.getState().clearHistory();

    expect(store.getState().history).toEqual([]);
  });

  it('starts with no active result, and F4/Shift+F4 move it (plan 11, B-19, S-141)', () => {
    const store = searchViewStore('/srv/projects/p');

    expect(store.getState().activeResultKey).toBeNull();

    store.getState().setActiveResultKey('a.ts\u00001:1');
    expect(store.getState().activeResultKey).toBe('a.ts\u00001:1');

    store.getState().setActiveResultKey(null);
    expect(store.getState().activeResultKey).toBeNull();
  });

  it('starts "to exclude" and "use ignore files" from the search preferences (plan 11, B-19, S-140)', () => {
    useSearchPreferences.getState().set('exclude', '*.generated.ts');
    useSearchPreferences.getState().set('useIgnoreFiles', false);

    const store = searchViewStore('/srv/projects/q');

    expect(store.getState().exclude).toBe('*.generated.ts');
    expect(store.getState().useIgnoreFiles).toBe(false);
  });
});
