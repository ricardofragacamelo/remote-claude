import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import type { HistoryEntry, HistoryReason } from '../types/history';

/** What the Timeline lists: the versions of one file, or the files deleted from the folder. */
export type TimelineMode = 'file' | 'deleted';

/** The file whose versions are listed — one that no longer exists is reached from "Recently deleted". */
export interface TimelineSubject {
  readonly path: string;
  readonly gone: boolean;
}

/** A restore asked, waiting for the person's word — there are unsaved changes, or the file is sensitive. */
export interface RestoreQuestion {
  readonly entry: HistoryEntry;

  /** The buffer of the file has changes a restore would discard. */
  readonly dirty: boolean;

  /** The file changes what Claude may do (07 · D-15). */
  readonly sensitive: boolean;
}

/** The Timeline of one folder tab. */
export interface TimelineState {
  /** The section is open — a closed one reads nothing. */
  readonly open: boolean;
  readonly mode: TimelineMode;

  /**
   * The file listed: the active file of the editor, kept while a diff tab is on screen — the diff
   * the Timeline itself opened must not empty it.
   */
  readonly subject: TimelineSubject | null;
  readonly reason: HistoryReason | null;

  /** The version picked to be compared with another one. */
  readonly selected: HistoryEntry | null;
  readonly question: RestoreQuestion | null;
  readonly helpOpen: boolean;

  /** Grows each time something asks for the focus in the section. */
  readonly focusRequest: number;

  setOpen(open: boolean): void;
  setMode(mode: TimelineMode): void;

  /** The editor's active file changed: the Timeline follows it — never back to nothing. */
  follow(path: string | null): void;

  /** The versions of a file that no longer exists. */
  showGone(path: string): void;
  setReason(reason: HistoryReason | null): void;
  select(entry: HistoryEntry | null): void;
  ask(question: RestoreQuestion | null): void;
  setHelpOpen(open: boolean): void;

  /** Opens the section in a mode, and asks for the focus in it — what the palette's commands do. */
  reveal(mode: TimelineMode): void;
}

export type TimelineStore = StoreApi<TimelineState>;

function createTimelineStore(): TimelineStore {
  return createStore<TimelineState>((set) => ({
    open: false,
    mode: 'file',
    subject: null,
    reason: null,
    selected: null,
    question: null,
    helpOpen: false,
    focusRequest: 0,

    setOpen: (open) => {
      set({ open });
    },
    setMode: (mode) => {
      set({ mode, selected: null });
    },
    follow: (path) => {
      set((state) =>
        path === null || (state.subject?.path === path && !state.subject.gone)
          ? state
          : { subject: { path, gone: false }, selected: null, mode: 'file' },
      );
    },
    showGone: (path) => {
      set({ subject: { path, gone: true }, selected: null, mode: 'file', reason: null });
    },
    setReason: (reason) => {
      set({ reason });
    },
    select: (selected) => {
      set({ selected });
    },
    ask: (question) => {
      set({ question });
    },
    setHelpOpen: (helpOpen) => {
      set({ helpOpen });
    },
    reveal: (mode) => {
      set((state) => ({ open: true, mode, focusRequest: state.focusRequest + 1 }));
    },
  }));
}

const stores = new Map<string, TimelineStore>();

/** The Timeline of one folder tab, made the first time it is asked for. */
export function timelineStore(folder: string): TimelineStore {
  let store = stores.get(folder);

  if (store === undefined) {
    store = createTimelineStore();
    stores.set(folder, store);
  }

  return store;
}

/** Drops the Timeline of a closed tab — or of every tab, for `null`. */
export function forgetTimeline(folder: string | null): void {
  for (const each of folder === null ? [...stores.keys()] : [folder]) {
    stores.delete(each);
  }
}
