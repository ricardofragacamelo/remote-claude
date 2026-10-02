import type { TabRestorer } from '@/features/workbench';
import { forgetTimeline } from '@/features/file-history';
import { isRecord } from '@/shared/lib/json';
import { SORT_ORDERS } from '../types/explorer';
import type { SortOrder } from '../types/explorer';
import { explorerStore, forgetExplorer } from './explorer.store';

/**
 * What a reload gives the Explorer of a tab back: the folders open, the selection, the row the
 * keyboard was on, and the options of the view — **paths only**. The undo stack is not: it undoes
 * what was done on this page (web/04), and file contents never reach the browser's storage (D-14).
 */
export interface KeptExplorer {
  readonly expanded: readonly string[];
  readonly selection: readonly string[];
  readonly focused: string | null;
  readonly showHidden: boolean;
  readonly sort: SortOrder;
  readonly compact: boolean;
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((each): each is string => typeof each === 'string')
    : [];
}

/** A kept Explorer, as far as it can be trusted: anything unreadable is its default. */
export function keptExplorerFrom(saved: unknown): KeptExplorer | undefined {
  if (!isRecord(saved)) {
    return undefined;
  }

  const sort = saved['sort'];

  return {
    expanded: strings(saved['expanded']),
    selection: strings(saved['selection']),
    focused: typeof saved['focused'] === 'string' ? saved['focused'] : null,
    showHidden: saved['showHidden'] === true,
    sort: SORT_ORDERS.includes(sort as SortOrder) ? (sort as SortOrder) : 'name',
    compact: saved['compact'] !== false,
  };
}

/** The Explorer's part of what a folder tab keeps across a reload (06 · D-31). */
export const EXPLORER_RESTORER: TabRestorer<KeptExplorer> = {
  id: 'explorer.tree',
  position: 200,
  version: 1,
  parse: keptExplorerFrom,
  capture: (path) => {
    const { expanded, selection, focused, showHidden, sort, compact } =
      explorerStore(path).getState();
    return { expanded: [...expanded], selection, focused, showHidden, sort, compact };
  },
  apply: (path, kept) => {
    explorerStore(path).setState({
      expanded: new Set(['', ...kept.expanded]),
      selection: kept.selection,
      focused: kept.focused,
      anchor: kept.focused,
      showHidden: kept.showHidden,
      sort: kept.sort,
      compact: kept.compact,
    });
  },
  subscribe: (path, listener) => explorerStore(path).subscribe(listener),
  // The Timeline of the Explorer goes with the tab too.
  forget: (path) => {
    forgetExplorer(path);
    forgetTimeline(path);
  },
};
