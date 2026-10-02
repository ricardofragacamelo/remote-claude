import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import type { OriginFilter, SessionGroup, SessionSort } from '../types/sessions-view';

/** What the view of Claude's sessions keeps **for one folder tab** (plan 08, B-09). */
export interface SessionsViewState {
  readonly search: string;
  readonly origin: OriginFilter;
  readonly sort: SessionSort;

  /** Whether the history brings the conversations of the folders below the tab's too (D-05). */
  readonly includeSubfolders: boolean;

  /** The groups the person folded away. */
  readonly collapsed: ReadonlySet<SessionGroup>;

  /** The row the keyboard and the palette act on: a session id or a conversation id. */
  readonly selected: string | null;

  /** Where the list was scrolled to, so coming back to the view lands where it was. */
  readonly scrollTop: number;

  /** Whether the help of the view is open. */
  readonly helpOpen: boolean;

  setSearch(search: string): void;
  setOrigin(origin: OriginFilter): void;
  setSort(sort: SessionSort): void;
  setIncludeSubfolders(include: boolean): void;
  toggleGroup(group: SessionGroup): void;
  select(id: string | null): void;
  setScrollTop(scrollTop: number): void;
  setHelpOpen(open: boolean): void;
  clearFilters(): void;
}

export type SessionsViewStore = StoreApi<SessionsViewState>;

function createSessionsViewStore(): SessionsViewStore {
  return createStore<SessionsViewState>((set) => ({
    search: '',
    origin: 'all',
    sort: 'recent',
    includeSubfolders: false,
    collapsed: new Set(),
    selected: null,
    scrollTop: 0,
    helpOpen: false,

    setSearch: (search) => {
      set({ search });
    },
    setOrigin: (origin) => {
      set({ origin });
    },
    setSort: (sort) => {
      set({ sort });
    },
    setIncludeSubfolders: (includeSubfolders) => {
      set({ includeSubfolders });
    },
    toggleGroup: (group) => {
      set((state) => {
        const collapsed = new Set(state.collapsed);
        if (!collapsed.delete(group)) {
          collapsed.add(group);
        }
        return { collapsed };
      });
    },
    select: (selected) => {
      set({ selected });
    },
    setScrollTop: (scrollTop) => {
      set({ scrollTop });
    },
    setHelpOpen: (helpOpen) => {
      set({ helpOpen });
    },
    clearFilters: () => {
      set({ search: '', origin: 'all' });
    },
  }));
}

const stores = new Map<string, SessionsViewStore>();

/**
 * The state of the view **of one folder tab**, keyed by the folder's real path — never one global
 * for "the folder on screen": two tabs show different lists, and the filter of one is not the
 * other's (plan 08, S-38).
 */
export function sessionsViewStore(folder: string): SessionsViewStore {
  const existing = stores.get(folder);

  if (existing !== undefined) {
    return existing;
  }

  const created = createSessionsViewStore();
  stores.set(folder, created);
  return created;
}

/** The tab closed — or, for `null`, every tab went: its view's state goes with it. */
export function forgetSessionsView(folder: string | null): void {
  if (folder === null) {
    stores.clear();
    return;
  }

  stores.delete(folder);
}
