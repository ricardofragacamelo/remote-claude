import { useEffect, useEffectEvent } from 'react';
import { useStore } from 'zustand';

import { searchViewStore } from '../store/search-view.store';
import type { SearchViewState } from '../store/search-view.store';

/** The Search view's own fields of the address — present only while they differ from default. */
export interface SearchLocationValue {
  readonly q: string | undefined;
  readonly isRegex: boolean | undefined;
  readonly caseSensitive: boolean | undefined;
  readonly wholeWord: boolean | undefined;
  readonly include: string | undefined;
  readonly exclude: string | undefined;
  readonly useIgnoreFiles: boolean | undefined;
  readonly onlyOpenEditors: boolean | undefined;
}

function sameValue(left: SearchLocationValue, right: SearchLocationValue): boolean {
  return (
    left.q === right.q &&
    left.isRegex === right.isRegex &&
    left.caseSensitive === right.caseSensitive &&
    left.wholeWord === right.wholeWord &&
    left.include === right.include &&
    left.exclude === right.exclude &&
    left.useIgnoreFiles === right.useIgnoreFiles &&
    left.onlyOpenEditors === right.onlyOpenEditors
  );
}

/** The view's own flags, as its store has them — never a field left to a default unresolved. */
type StoreValue = Pick<
  SearchViewState,
  | 'query'
  | 'isRegex'
  | 'caseSensitive'
  | 'wholeWord'
  | 'include'
  | 'exclude'
  | 'useIgnoreFiles'
  | 'onlyOpenEditors'
>;

/** `search`, as the view's own store would have it — `undefined` fields are the view's own default. */
function asStore(search: SearchLocationValue): StoreValue {
  return {
    query: search.q ?? '',
    isRegex: search.isRegex ?? false,
    caseSensitive: search.caseSensitive ?? false,
    wholeWord: search.wholeWord ?? false,
    include: search.include ?? '',
    exclude: search.exclude ?? '',
    useIgnoreFiles: search.useIgnoreFiles ?? true,
    onlyOpenEditors: search.onlyOpenEditors ?? false,
  };
}

/** The view's own store, read as the address would have it — `undefined` for every field at its default. */
function fromStore(folder: string): SearchLocationValue {
  const state = searchViewStore(folder).getState();

  return {
    q: state.query === '' ? undefined : state.query,
    isRegex: state.isRegex ? true : undefined,
    caseSensitive: state.caseSensitive ? true : undefined,
    wholeWord: state.wholeWord ? true : undefined,
    include: state.include === '' ? undefined : state.include,
    exclude: state.exclude === '' ? undefined : state.exclude,
    useIgnoreFiles: state.useIgnoreFiles ? undefined : false,
    onlyOpenEditors: state.onlyOpenEditors ? true : undefined,
  };
}

/**
 * The Search view's query and toggles, and the address, kept in step (plan 11, B-15, S-120):
 *
 * - what a link names is opened — one pasted elsewhere reproduces the same search;
 * - what a person types or toggles goes to the address, replacing it — a field at its own default
 *   stays out of the link, so the common search stays a short one.
 *
 * Nothing else of the view — the tree's own collapsed, dismissed and stale rows — is the address's:
 * those are a screen's own memory, not a thing to paste (docs/architecture/web/04-state-and-data.md#a-url-é-estado).
 *
 * @param onSearch writes the view's own fields to the address — the route's to perform
 */
export function useSearchLocation(
  folder: string,
  search: SearchLocationValue,
  onSearch: (search: SearchLocationValue) => void,
): void {
  const store = searchViewStore(folder);
  const state = useStore(store);

  useEffect(() => {
    const wanted = asStore(search);
    const current = store.getState();

    if (wanted.query !== current.query) {
      current.setQuery(wanted.query);
    }
    if (wanted.isRegex !== current.isRegex) {
      current.setIsRegex(wanted.isRegex);
    }
    if (wanted.caseSensitive !== current.caseSensitive) {
      current.setCaseSensitive(wanted.caseSensitive);
    }
    if (wanted.wholeWord !== current.wholeWord) {
      current.setWholeWord(wanted.wholeWord);
    }
    if (wanted.include !== current.include) {
      current.setInclude(wanted.include);
    }
    if (wanted.exclude !== current.exclude) {
      current.setExclude(wanted.exclude);
    }
    if (wanted.useIgnoreFiles !== current.useIgnoreFiles) {
      current.setUseIgnoreFiles(wanted.useIgnoreFiles);
    }
    if (wanted.onlyOpenEditors !== current.onlyOpenEditors) {
      current.setOnlyOpenEditors(wanted.onlyOpenEditors);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `search` is a fresh object every render (the route builds it from its own search); its fields, spelled out, are what actually decides whether this runs
  }, [
    folder,
    search.q,
    search.isRegex,
    search.caseSensitive,
    search.wholeWord,
    search.include,
    search.exclude,
    search.useIgnoreFiles,
    search.onlyOpenEditors,
  ]);

  // Told the address as it is whenever the view's own fields change — a new address alone is
  // answered above, and the two never loop: once applied, the store matches the address already.
  const report = useEffectEvent(() => {
    const next = fromStore(folder);

    if (!sameValue(next, search)) {
      onSearch(next);
    }
  });

  useEffect(() => {
    report();
  }, [folder, state]);
}
