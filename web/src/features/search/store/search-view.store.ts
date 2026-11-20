import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import { perFolder } from '@/shared/lib/per-folder';
import { useSearchPreferences } from './search-preferences.store';

/** One dismissed row: a whole file (`path`), or one match of it (`path\u0000line:column`). */
function matchKey(path: string, line: number, column: number): string {
  return `${path}\u0000${String(line)}:${String(column)}`;
}

/** The Search view of one folder tab (plan 11, B-15) — its own query, flags, and what it did to the tree. */
export interface SearchViewState {
  readonly query: string;
  readonly isRegex: boolean;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly include: string;
  readonly exclude: string;
  readonly useIgnoreFiles: boolean;
  readonly onlyOpenEditors: boolean;

  /** The replace row, open or closed by the arrow — closed is every search's own start (B-16). */
  readonly replaceOpen: boolean;
  readonly replacement: string;
  readonly preserveCase: boolean;

  /** File paths collapsed by hand — absent is expanded, which is every file's own start (VS Code's). */
  readonly collapsed: ReadonlySet<string>;

  /** Dismissed rows, by {@link matchKey} — a whole file, or one of its matches. */
  readonly dismissed: ReadonlySet<string>;

  /** Files changed on disk since the search ran (S-123) — "search again" clears all of it. */
  readonly stale: ReadonlySet<string>;

  /** Queries run before, this folder's own, newest first (plan 11, B-18, S-136) — a visitor's. */
  readonly history: readonly string[];

  /** The match F4/Shift+F4 last opened (plan 11, B-19) — `null` before the first press. */
  readonly activeResultKey: string | null;

  setQuery(query: string): void;
  setIsRegex(value: boolean): void;
  setCaseSensitive(value: boolean): void;
  setWholeWord(value: boolean): void;
  setInclude(include: string): void;
  setExclude(exclude: string): void;
  setUseIgnoreFiles(value: boolean): void;
  setOnlyOpenEditors(value: boolean): void;

  setReplaceOpen(open: boolean): void;
  setReplacement(replacement: string): void;
  setPreserveCase(value: boolean): void;

  toggleCollapsed(path: string): void;
  collapseAll(paths: readonly string[]): void;
  expandAll(): void;

  dismissFile(path: string): void;
  dismissMatch(path: string, line: number, column: number): void;

  markStale(path: string): void;
  clearStale(): void;

  /** `query` ran, kept to the front of the history — a repeat right after itself is not kept twice. */
  pushHistory(query: string): void;

  /** Empties this folder's own history — "Limpar histórico" of the palette (S-138). */
  clearHistory(): void;

  /** `F4`/`Shift+F4` moved to this match (plan 11, B-19) — or back to `null`, nothing opened yet. */
  setActiveResultKey(key: string | null): void;
}

/** The history's own ceiling (S-136) — past it, the oldest query is the one let go of. */
export const SEARCH_HISTORY_LIMIT = 50;

export type SearchViewStore = StoreApi<SearchViewState>;

function createSearchViewStore(): SearchViewStore {
  const defaults = useSearchPreferences.getState().preferences;

  return createStore<SearchViewState>((set) => ({
    query: '',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    include: '',
    exclude: defaults.exclude,
    useIgnoreFiles: defaults.useIgnoreFiles,
    onlyOpenEditors: false,
    replaceOpen: false,
    replacement: '',
    preserveCase: false,
    collapsed: new Set(),
    dismissed: new Set(),
    stale: new Set(),
    history: [],
    activeResultKey: null,

    setQuery: (query) => {
      set({ query });
    },
    setIsRegex: (isRegex) => {
      set({ isRegex });
    },
    setCaseSensitive: (caseSensitive) => {
      set({ caseSensitive });
    },
    setWholeWord: (wholeWord) => {
      set({ wholeWord });
    },
    setInclude: (include) => {
      set({ include });
    },
    setExclude: (exclude) => {
      set({ exclude });
    },
    setUseIgnoreFiles: (useIgnoreFiles) => {
      set({ useIgnoreFiles });
    },
    setOnlyOpenEditors: (onlyOpenEditors) => {
      set({ onlyOpenEditors });
    },

    setReplaceOpen: (replaceOpen) => {
      set({ replaceOpen });
    },
    setReplacement: (replacement) => {
      set({ replacement });
    },
    setPreserveCase: (preserveCase) => {
      set({ preserveCase });
    },

    toggleCollapsed: (path) => {
      set((state) => {
        const collapsed = new Set(state.collapsed);
        if (collapsed.has(path)) {
          collapsed.delete(path);
        } else {
          collapsed.add(path);
        }
        return { collapsed };
      });
    },
    collapseAll: (paths) => {
      set({ collapsed: new Set(paths) });
    },
    expandAll: () => {
      set({ collapsed: new Set() });
    },

    dismissFile: (path) => {
      set((state) => ({ dismissed: new Set(state.dismissed).add(path) }));
    },
    dismissMatch: (path, line, column) => {
      set((state) => ({ dismissed: new Set(state.dismissed).add(matchKey(path, line, column)) }));
    },

    markStale: (path) => {
      set((state) => ({ stale: new Set(state.stale).add(path) }));
    },
    clearStale: () => {
      set({ stale: new Set() });
    },

    pushHistory: (query) => {
      set((state) => {
        if (query === '' || state.history[0] === query) {
          return state;
        }
        return { history: [query, ...state.history].slice(0, SEARCH_HISTORY_LIMIT) };
      });
    },
    clearHistory: () => {
      set({ history: [] });
    },

    setActiveResultKey: (key) => {
      set({ activeResultKey: key });
    },
  }));
}

const stores = perFolder(createSearchViewStore);

/**
 * The Search view's own state, kept by the folder's real path — never one global: two folder tabs
 * never share a query, and coming back to one keeps what it had (S-121).
 */
export function searchViewStore(folder: string): SearchViewStore {
  return stores.of(folder);
}

/** The folder tab closed — or, for `null`, every one went. */
export function forgetSearchView(folder: string | null): void {
  stores.forget(folder);
}

/**
 * Fills "files to include" with `path` — the Explorer's own "Search in folder…" (plan 11, B-15,
 * S-119). The folder itself (`path === ''`) searches everywhere, same as no filter at all.
 */
export function searchInFolder(folder: string, path: string): void {
  searchViewStore(folder)
    .getState()
    .setInclude(path === '' ? '' : `${path}/**`);
}

/** Whether `path` (a file) or the match at `line`/`column` was dismissed from the tree. */
export function isDismissed(
  dismissed: ReadonlySet<string>,
  path: string,
  line?: number,
  column?: number,
): boolean {
  return (
    dismissed.has(path) ||
    (line !== undefined && column !== undefined && dismissed.has(matchKey(path, line, column)))
  );
}
