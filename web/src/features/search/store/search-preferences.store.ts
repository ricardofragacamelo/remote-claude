import { create } from 'zustand';

import { isRecord } from '@/shared/lib/json';
import type { StorageSource } from '@/shared/lib/visitor-storage';
import { readVisitor, withVisitorChange } from '@/shared/lib/visitor-storage';

/** The context lines a fresh "open in editor" starts with — the editor's own ceiling, 1 to 9. */
export const RESULTS_EDITOR_CONTEXT_LINES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** What a search starts with, until changed in Settings › Busca (plan 11, B-19). */
export interface SearchPreferences {
  /** Globs excluded from every search and Quick Open, on top of the 07/VS Code/ignore files ones. */
  readonly exclude: string;
  readonly useIgnoreFiles: boolean;

  /** Case-sensitive the moment the query has an upper-case letter, insensitive otherwise. */
  readonly smartCase: boolean;
  readonly resultsEditorContextLines: (typeof RESULTS_EDITOR_CONTEXT_LINES)[number];
}

/** What somebody who never changed a thing has. */
export const DEFAULT_SEARCH_PREFERENCES: SearchPreferences = {
  exclude: '',
  useIgnoreFiles: true,
  smartCase: false,
  resultsEditorContextLines: 2,
};

const PREFERENCES_KEY = 'search.preferences';

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Kept preferences, as far as they can be trusted: each one that is not one of its values is its
 * default — a hand-written or older value never breaks the search.
 */
export function searchPreferencesFrom(value: unknown): SearchPreferences | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const d = DEFAULT_SEARCH_PREFERENCES;

  return {
    exclude: typeof value['exclude'] === 'string' ? value['exclude'] : d.exclude,
    useIgnoreFiles: flag(value['useIgnoreFiles'], d.useIgnoreFiles),
    smartCase: flag(value['smartCase'], d.smartCase),
    resultsEditorContextLines: RESULTS_EDITOR_CONTEXT_LINES.includes(
      value['resultsEditorContextLines'] as (typeof RESULTS_EDITOR_CONTEXT_LINES)[number],
    )
      ? (value['resultsEditorContextLines'] as (typeof RESULTS_EDITOR_CONTEXT_LINES)[number])
      : d.resultsEditorContextLines,
  };
}

/** The preferences this visitor kept — the defaults when the browser keeps nothing. */
export function initialSearchPreferences(storage?: StorageSource): SearchPreferences {
  return readVisitor(PREFERENCES_KEY, searchPreferencesFrom, storage) ?? DEFAULT_SEARCH_PREFERENCES;
}

export interface SearchPreferencesState {
  readonly preferences: SearchPreferences;

  /** Changes one preference, for every search started after it, and keeps it for this browser. */
  set<K extends keyof SearchPreferences>(key: K, value: SearchPreferences[K]): void;
}

/**
 * The search's own preferences (plan 11, B-19) — a convenience of this browser, kept by visitor
 * storage: a storage that throws is a visitor with the defaults, never a broken search.
 */
export const useSearchPreferences = create<SearchPreferencesState>((set, get) => ({
  preferences: initialSearchPreferences(),
  set: (key, value) => {
    set({ preferences: withVisitorChange(PREFERENCES_KEY, get().preferences, { [key]: value }) });
  },
}));
