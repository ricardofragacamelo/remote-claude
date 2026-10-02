import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import { ancestorsOf, isWithin, rebased } from '../lib/paths';
import type { UndoEntry } from '../lib/undo';
import type { NewEntryKind, SortOrder } from '../types/explorer';

/** A new entry being named in place: where, what, and what it starts with. */
export interface Creating {
  readonly parent: string;
  readonly kind: NewEntryKind;

  /** What the field starts with — a template's suggested name, a file's copy name. */
  readonly initialName: string;

  /** The template it starts from, by id. */
  readonly template: string | null;

  /** The file whose text it starts with — "New from this file". */
  readonly source: string | null;
}

/** What "Copy" or "Cut" put aside, for "Paste" — one per folder tab. */
export interface Clipboard {
  readonly mode: 'copy' | 'cut';
  readonly paths: readonly string[];
}

/** What is said through the live region — and an id, so the same words twice are said twice. */
export interface Announcement {
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly id: number;
}

/** How the disk is followed for this folder (B-28). */
export type WatchState =
  | { readonly state: 'following' }
  | { readonly state: 'unavailable'; readonly code: string }
  | { readonly state: 'stopped'; readonly reason: string };

/** The state of the Explorer **of one folder tab**. */
export interface ExplorerState {
  /** The folders open in the tree, by path — `''`, the folder itself, always is. */
  readonly expanded: ReadonlySet<string>;
  readonly selection: readonly string[];

  /** Where a Shift selection grows from. */
  readonly anchor: string | null;

  /** The row the keyboard is on — the one tab stop of the tree. */
  readonly focused: string | null;
  readonly showHidden: boolean;
  readonly sort: SortOrder;
  readonly compact: boolean;
  readonly filter: string;
  readonly creating: Creating | null;
  readonly renaming: string | null;
  readonly clipboard: Clipboard | null;

  /** What `Ctrl+Z` undoes, the last first. Never kept across a reload (web/04). */
  readonly undo: readonly UndoEntry[];

  /** Raised to ask the tree to take the focus, on `focused`. */
  readonly focusRequest: number;

  /** Raised to ask the field of the filter to take the focus. */
  readonly filterRequest: number;
  readonly announcement: Announcement | null;
  readonly watch: WatchState;

  /** Raised to ask for every folder read again — a reload by hand, a reconnect, an overflow. */
  readonly reloads: number;

  toggle(path: string): void;
  expand(path: string): void;
  collapse(path: string): void;
  collapseAll(): void;

  /** Selects `paths` and puts the keyboard on `focused`. */
  select(paths: readonly string[], focused: string | null, anchor?: string | null): void;
  setFocused(path: string | null): void;
  setShowHidden(showHidden: boolean): void;
  setSort(sort: SortOrder): void;
  setCompact(compact: boolean): void;
  setFilter(filter: string): void;
  startCreating(creating: Creating): void;
  startRenaming(path: string): void;
  stopEditing(): void;
  setClipboard(clipboard: Clipboard | null): void;
  pushUndo(entry: UndoEntry): void;

  /** Takes the last undoable operation off the stack, and answers it. */
  popUndo(): UndoEntry | null;

  /** Opens every folder above `path`, selects it and asks for the focus — "Reveal" (S-178). */
  reveal(path: string): void;
  requestFocus(): void;
  requestFilter(): void;
  announce(key: string, params?: Readonly<Record<string, string | number>>): void;
  setWatch(watch: WatchState): void;
  reload(): void;

  /** An entry moved: what was open, selected or put aside under it follows it. */
  moved(from: string, to: string): void;
}

export type ExplorerStore = StoreApi<ExplorerState>;

/** The paths of a set that survive a move of `from` to `to`, rebased. */
function rebaseAll(paths: Iterable<string>, from: string, to: string): string[] {
  return [...paths].map((path) => (isWithin(path, from) ? rebased(path, from, to) : path));
}

function rebaseOne(path: string | null, from: string, to: string): string | null {
  return path !== null && isWithin(path, from) ? rebased(path, from, to) : path;
}

let announcements = 0;

function createExplorerStore(): ExplorerStore {
  return createStore<ExplorerState>((set, get) => ({
    expanded: new Set(['']),
    selection: [],
    anchor: null,
    focused: null,
    showHidden: false,
    sort: 'name',
    compact: true,
    filter: '',
    creating: null,
    renaming: null,
    clipboard: null,
    undo: [],
    focusRequest: 0,
    filterRequest: 0,
    announcement: null,
    watch: { state: 'following' },
    reloads: 0,

    toggle: (path) => {
      (get().expanded.has(path) ? get().collapse : get().expand)(path);
    },
    expand: (path) => {
      set((state) => ({ expanded: new Set([...state.expanded, path]) }));
    },
    collapse: (path) => {
      set((state) => ({
        expanded: new Set([...state.expanded].filter((each) => each !== path)),
      }));
    },
    collapseAll: () => {
      set({ expanded: new Set(['']) });
    },
    select: (paths, focused, anchor) => {
      set((state) => ({
        selection: [...new Set(paths)],
        focused,
        anchor: anchor === undefined ? (focused ?? state.anchor) : anchor,
      }));
    },
    setFocused: (focused) => {
      set({ focused });
    },
    setShowHidden: (showHidden) => {
      set({ showHidden });
    },
    setSort: (sort) => {
      set({ sort });
    },
    setCompact: (compact) => {
      set({ compact });
    },
    setFilter: (filter) => {
      set({ filter });
    },
    startCreating: (creating) => {
      set((state) => ({
        creating,
        renaming: null,
        expanded: new Set([...state.expanded, creating.parent, ...ancestorsOf(creating.parent)]),
      }));
    },
    startRenaming: (renaming) => {
      set({ renaming, creating: null });
    },
    stopEditing: () => {
      set({ renaming: null, creating: null });
    },
    setClipboard: (clipboard) => {
      set({ clipboard });
    },
    pushUndo: (entry) => {
      set((state) => ({ undo: [...state.undo, entry] }));
    },
    popUndo: () => {
      const last = get().undo.at(-1) ?? null;

      if (last !== null) {
        set((state) => ({ undo: state.undo.slice(0, -1) }));
      }

      return last;
    },
    reveal: (path) => {
      set((state) => ({
        expanded: new Set([...state.expanded, ...ancestorsOf(path)]),
        selection: [path],
        focused: path,
        anchor: path,
        filter: '',
        focusRequest: state.focusRequest + 1,
      }));
    },
    requestFocus: () => {
      set((state) => ({ focusRequest: state.focusRequest + 1 }));
    },
    requestFilter: () => {
      set((state) => ({ filterRequest: state.filterRequest + 1 }));
    },
    announce: (key, params = {}) => {
      announcements += 1;
      set({ announcement: { key, params, id: announcements } });
    },
    setWatch: (watch) => {
      set({ watch });
    },
    reload: () => {
      set((state) => ({ reloads: state.reloads + 1 }));
    },
    moved: (from, to) => {
      set((state) => ({
        expanded: new Set(rebaseAll(state.expanded, from, to)),
        selection: rebaseAll(state.selection, from, to),
        focused: rebaseOne(state.focused, from, to),
        anchor: rebaseOne(state.anchor, from, to),
      }));
    },
  }));
}

const stores = new Map<string, ExplorerStore>();

/**
 * The Explorer of one folder tab, keyed by the folder's **real** path — made by a factory, never one
 * global: `/r/app` and `/r/app/pkg` open side by side share nothing (S-160, S-12). It stays in memory
 * while the tab is open and not on screen, and goes with the tab (`forgetExplorer`).
 */
export function explorerStore(folder: string): ExplorerStore {
  const existing = stores.get(folder);

  if (existing !== undefined) {
    return existing;
  }

  const created = createExplorerStore();
  stores.set(folder, created);
  return created;
}

/** Drops the Explorer of a closed tab — or of every tab, for `null`. */
export function forgetExplorer(folder: string | null): void {
  if (folder === null) {
    stores.clear();
  } else {
    stores.delete(folder);
  }
}
