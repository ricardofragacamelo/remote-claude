import { useEffect, useState } from 'react';
import { useStore } from 'zustand';

import { openFile, openFiles } from '@/features/editor';
import { folderWatches } from '@/shared/api/ws';
import type { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';
import { baseQueryOf } from '../lib/query-fields';
import { copyAllOf, rowsOf } from '../lib/rows-and-copy';
import type { SearchRow } from '../lib/search-rows';
import { searchViewStore } from '../store/search-view.store';
import type { SearchViewState } from '../store/search-view.store';
import { useRetainedOnRefusal } from './retained-on-refusal';
import { useTextSearch } from './useTextSearch';
import type { SearchMatch, SearchQuery, SearchTruncation } from '../types/search';

/** The flags and filters a request is built from — the store's own, read-only here. */
type SearchViewFlags = Pick<
  SearchViewState,
  | 'query'
  | 'isRegex'
  | 'caseSensitive'
  | 'wholeWord'
  | 'include'
  | 'exclude'
  | 'useIgnoreFiles'
  | 'onlyOpenEditors'
  | 'replaceOpen'
>;

/**
 * The request the Search view asks with — `null` while there is nothing typed yet, or while the
 * replace row is open: its own preview (B-16) already carries every match this would, and running
 * both at once would spend two of the two concurrent searches a user gets (D-06) on one tab alone.
 */
function queryOf(folder: string, state: SearchViewFlags): SearchQuery | null {
  if (state.query === '' || state.replaceOpen) {
    return null;
  }

  return {
    ...baseQueryOf(state),
    ...(state.onlyOpenEditors ? { onlyPaths: openFiles(folder) } : {}),
  };
}

/** The store's own actions the view passes straight through, unchanged. */
type SearchViewActions = Pick<
  SearchViewState,
  | 'setQuery'
  | 'setIsRegex'
  | 'setCaseSensitive'
  | 'setWholeWord'
  | 'setInclude'
  | 'setExclude'
  | 'setUseIgnoreFiles'
  | 'setOnlyOpenEditors'
  | 'toggleCollapsed'
  | 'expandAll'
  | 'dismissFile'
  | 'dismissMatch'
>;

/** What the view, as the screen reads it. */
export interface SearchView extends SearchViewFlags, SearchViewActions {
  readonly folder: string;

  readonly rows: readonly SearchRow[];
  readonly resultCount: number;
  readonly fileCount: number;
  readonly isSearching: boolean;
  readonly error: AppError | null;
  readonly truncated: SearchTruncation;
  readonly skipped: number;

  /** Collapses every file on screen — unlike the store's own, needs no list from the caller. */
  collapseAll(): void;

  /** Opens the match's file at its line and column, the matched text selected (S-116). */
  open(path: string, match: SearchMatch, toSide: boolean): void;

  /** Runs the same search again, clearing every stale mark (S-123). */
  searchAgain(): void;

  /** Every result, as "Copy All" writes it — a collapsed file's matches copy too (S-118). */
  copyAllText(): string;

  /** The screen's own help sheet (plan 11, B-20, S-142) — never kept across a reload. */
  readonly helpOpen: boolean;
  setHelpOpen(open: boolean): void;
}

/** The range one match covers — always one line, column to `endColumn` (plan 11, B-10, S-65). */
function rangeOf(match: SearchMatch): {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
} {
  return {
    startLine: match.line,
    startColumn: match.column,
    endLine: match.line,
    endColumn: match.endColumn,
  };
}

/**
 * The Search view of one folder tab (plan 11, B-15): its own query and flags, the results tree
 * flattened for the virtualized list, and every action the toolbar and the context menu share.
 * Everything is the tab's — another folder tab has none of this (S-121).
 */
export function useSearchView(folder: string): SearchView {
  const store = searchViewStore(folder);
  const state = useStore(store);
  const request = queryOf(folder, state);
  const textSearch = useTextSearch(folder, request);
  const [helpOpen, setHelpOpen] = useState(false);

  // What a refusal shows beside, never instead of (S-114) — kept through it the shared way (B-16).
  const files = useRetainedOnRefusal(textSearch.files, request !== null, textSearch.error !== null);

  // A file changed on disk since the search ran — its result is marked stale, with "search again"
  // the only way shown to clear it (S-123); `overflow` means more changed than the event carries,
  // so every result is suspect. Nothing to watch for without a search of its own: an idle tab's
  // badge never holds a `workspace.watch` of the folder just to show nothing.
  useEffect(() => {
    if (request === null) {
      return;
    }

    return folderWatches.watch(folder, {
      onChanges: (changes, overflow) => {
        if (overflow) {
          for (const file of files) {
            store.getState().markStale(file.path);
          }
          return;
        }
        const changed = new Set(changes.map((change) => change.path));
        for (const file of files) {
          if (changed.has(file.path)) {
            store.getState().markStale(file.path);
          }
        }
      },
      onWatching: () => undefined,
      onStopped: (reason) => {
        logger.debug({ op: 'search.watch', folder, reason }, 'search stopped following the folder');
      },
      onRefused: (refusal) => {
        logger.debug(
          { op: 'search.watch', folder, code: refusal.code },
          'search could not follow the folder',
        );
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `request === null` decides whether this effect runs at all (the early return above); `request` itself is a fresh object every render and would tear the subscription down on every keystroke
  }, [folder, files, store, request === null]);

  const { rows, resultCount } = rowsOf(files, state);

  return {
    folder,
    query: state.query,
    isRegex: state.isRegex,
    caseSensitive: state.caseSensitive,
    wholeWord: state.wholeWord,
    include: state.include,
    exclude: state.exclude,
    useIgnoreFiles: state.useIgnoreFiles,
    onlyOpenEditors: state.onlyOpenEditors,
    replaceOpen: state.replaceOpen,

    rows,
    resultCount,
    fileCount: rows.filter((row) => row.kind === 'file').length,
    isSearching: textSearch.isSearching,
    error: textSearch.error,
    truncated: textSearch.truncated,
    skipped: textSearch.skipped,

    setQuery: store.getState().setQuery,
    setIsRegex: store.getState().setIsRegex,
    setCaseSensitive: store.getState().setCaseSensitive,
    setWholeWord: store.getState().setWholeWord,
    setInclude: store.getState().setInclude,
    setExclude: store.getState().setExclude,
    setUseIgnoreFiles: store.getState().setUseIgnoreFiles,
    setOnlyOpenEditors: store.getState().setOnlyOpenEditors,

    toggleCollapsed: store.getState().toggleCollapsed,
    collapseAll: () => {
      store.getState().collapseAll(files.map((file) => file.path));
    },
    expandAll: store.getState().expandAll,

    dismissFile: store.getState().dismissFile,
    dismissMatch: store.getState().dismissMatch,

    open: (path, match, toSide) => {
      openFile(folder, path, { selection: rangeOf(match), toSide });
    },

    searchAgain: () => {
      store.getState().clearStale();
      textSearch.reload();
    },

    copyAllText: () => copyAllOf(files, state),

    helpOpen,
    setHelpOpen,
  };
}
