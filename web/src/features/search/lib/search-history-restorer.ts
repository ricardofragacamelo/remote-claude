import type { TabRestorer } from '@/features/workbench';
import { searchViewStore } from '../store/search-view.store';

/** A kept history, as far as it can be trusted — anything else is "nothing kept" (S-137). */
function historyFrom(saved: unknown): readonly string[] | undefined {
  return Array.isArray(saved) && saved.every((each) => typeof each === 'string')
    ? saved
    : undefined;
}

/**
 * What a reload gives this folder's own search history back (plan 11, B-18, D-08→D-13 of 06) —
 * the same `TabRestorer` the layout (06) and the open editors (07) use, so a blocked or unavailable
 * storage degrades to "no history" the exact same way every other kept convenience already does,
 * never a broken screen (S-137).
 */
export const SEARCH_HISTORY_RESTORER: TabRestorer<readonly string[]> = {
  id: 'search.history',
  position: 300,
  version: 1,
  parse: historyFrom,
  capture: (path) => searchViewStore(path).getState().history,
  apply: (path, value) => {
    searchViewStore(path).setState({ history: value });
  },
  subscribe: (path, listener) => searchViewStore(path).subscribe(listener),
};
