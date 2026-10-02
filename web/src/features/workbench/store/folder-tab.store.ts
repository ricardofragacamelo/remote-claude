import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import { createRegistry } from '@/shared/lib/registry';
import { INITIAL_LAYOUT, layoutFrom } from '../hooks/workbench-layout';
import type { WorkbenchLayout } from '../hooks/workbench-layout';
import { MOBILE_VIEWS } from '../types/workbench';
import type { MobileView } from '../types/workbench';
import { forgetTab, forgetTabs, restoreTab } from './tab-state';
import type { TabRestorer } from './tab-state';

/** The view the side bar opens with: the first of the activity bar. */
export const FIRST_VIEW = 'explorer';

/** The state of the interface **of one folder tab**. */
export interface FolderTabUiState {
  /** The view of the activity bar the side bar shows. */
  readonly view: string;
  readonly sideBarOpen: boolean;
  readonly panelOpen: boolean;

  /** Whether the chat with Claude is on screen beside the editor (plan 08, B-32). */
  readonly secondaryOpen: boolean;

  /** Under `md`, the one view on screen — Claude's until somebody picks another. */
  readonly mobileView: MobileView;

  /** The sizes of the parts, in percent (plan 06, S-113). */
  readonly sizes: WorkbenchLayout;

  /** The session the Claude side bar shows, or `null` for "start one". */
  readonly sessionId: string | null;

  /**
   * A conversation of the history the side bar shows **read only**, with the way to continue it — or
   * `null`. Never beside a session: the panel shows one thing, and `showSession` and
   * `showConversation` each clear the other (plan 08, B-10).
   */
  readonly conversationId: string | null;

  /** The session on the panel came from a link, and is still to be found among the caller's. */
  readonly sessionFromLink: boolean;

  /** A link named a session that is not a live one of the caller's — the panel says so (B-12). */
  readonly linkRefused: boolean;

  /**
   * Picks a view of the activity bar — and picking the one already open closes the side bar, as the
   * editor people know does (plan 06, S-111).
   */
  pickView(view: string): void;

  /** Shows a view, and never closes anything — the one-view-at-a-time layout's way to pick. */
  showView(view: string): void;
  toggleSideBar(): void;
  togglePanel(): void;
  toggleSecondary(): void;

  /** Puts the chat with Claude on screen — beside the editor, or as the one view under `md`. */
  showSecondary(): void;
  showMobile(view: MobileView): void;

  /** Keeps new sizes — each brought back inside its limits. */
  resize(sizes: Partial<WorkbenchLayout>): void;
  showSession(sessionId: string | null): void;
  showConversation(conversationId: string | null): void;

  /** Puts on the panel a session a link named — to be checked before it is trusted. */
  openLinkedSession(sessionId: string): void;

  /** The session a link named is not the caller's, or not live: the panel says so instead. */
  refuseLink(): void;
}

export type FolderTabStore = StoreApi<FolderTabUiState>;

function createFolderTabStore(): FolderTabStore {
  return createStore<FolderTabUiState>((set) => ({
    view: FIRST_VIEW,
    sideBarOpen: true,
    panelOpen: false,
    secondaryOpen: true,
    mobileView: 'claude',
    sizes: INITIAL_LAYOUT,
    sessionId: null,
    conversationId: null,
    sessionFromLink: false,
    linkRefused: false,

    pickView: (view) => {
      set((state) =>
        state.view === view && state.sideBarOpen
          ? { sideBarOpen: false }
          : { view, sideBarOpen: true },
      );
    },
    showView: (view) => {
      set({ view, sideBarOpen: true });
    },
    toggleSideBar: () => {
      set((state) => ({ sideBarOpen: !state.sideBarOpen }));
    },
    togglePanel: () => {
      set((state) => ({ panelOpen: !state.panelOpen }));
    },
    toggleSecondary: () => {
      set((state) => ({ secondaryOpen: !state.secondaryOpen }));
    },
    showSecondary: () => {
      set({ secondaryOpen: true, mobileView: 'claude' });
    },
    showMobile: (mobileView) => {
      set({ mobileView });
    },
    resize: (sizes) => {
      set((state) => ({ sizes: layoutFrom({ ...state.sizes, ...sizes }) }));
    },
    showSession: (sessionId) => {
      set({
        sessionId,
        conversationId: null,
        sessionFromLink: false,
        linkRefused: false,
      });
    },
    showConversation: (conversationId) => {
      set({ conversationId, sessionId: null, sessionFromLink: false, linkRefused: false });
    },
    openLinkedSession: (sessionId) => {
      set({
        sessionId,
        conversationId: null,
        sessionFromLink: true,
        linkRefused: false,
      });
    },
    refuseLink: () => {
      set({ sessionId: null, sessionFromLink: false, linkRefused: true });
    },
  }));
}

/** What a reload gives a tab back of the layout: the view, the parts open, and their sizes. */
export type KeptLayout = Pick<
  FolderTabUiState,
  'view' | 'sideBarOpen' | 'panelOpen' | 'secondaryOpen' | 'mobileView' | 'sizes'
>;

function isMobileView(value: unknown): value is MobileView {
  return (MOBILE_VIEWS as readonly unknown[]).includes(value);
}

/**
 * A kept layout, as far as it can be trusted: a part that does not read as one of its values is its
 * default; a view nobody registers any more is resolved by the activity bar, as any other.
 */
export function keptLayoutFrom(saved: unknown): KeptLayout | undefined {
  if (typeof saved !== 'object' || saved === null) {
    return undefined;
  }

  const record = saved as Readonly<Record<string, unknown>>;

  return {
    view: typeof record['view'] === 'string' ? record['view'] : FIRST_VIEW,
    sideBarOpen: typeof record['sideBarOpen'] === 'boolean' ? record['sideBarOpen'] : true,
    panelOpen: typeof record['panelOpen'] === 'boolean' ? record['panelOpen'] : false,
    secondaryOpen: typeof record['secondaryOpen'] === 'boolean' ? record['secondaryOpen'] : true,
    mobileView: isMobileView(record['mobileView']) ? record['mobileView'] : 'claude',
    sizes: layoutFrom(record['sizes']),
  };
}

const stores = new Map<string, FolderTabStore>();

/** The layout of the tab — plan 06's own part of what a reload gives back (S-134). */
const LAYOUT: TabRestorer<KeptLayout> = {
  id: 'workbench.layout',
  position: 100,
  version: 1,
  parse: keptLayoutFrom,
  capture: (path) => {
    const { view, sideBarOpen, panelOpen, secondaryOpen, mobileView, sizes } =
      folderTabStore(path).getState();
    return { view, sideBarOpen, panelOpen, secondaryOpen, mobileView, sizes };
  },
  apply: (path, value) => {
    folderTabStore(path).setState(value);
  },
  subscribe: (path, listener) => folderTabStore(path).subscribe(listener),
};

/**
 * What a reload gives each folder tab back — the layout here; the open editors (plan 07) and the
 * open conversation (plan 08) register theirs, at load, before any tab is made.
 */
export const tabRestorers = createRegistry<TabRestorer>('tab restorers', [LAYOUT as TabRestorer]);

/**
 * The store of one folder tab, keyed by the folder's **real** path — made by a factory, never one
 * global for "the folder on screen" (docs/architecture/web/04-state-and-data.md#estado-de-aba-de-pasta).
 *
 * A global store of "the selected workspace" is what once sent a session to the first root instead
 * of the folder picked; one store per folder is what keeps two tabs from seeing each other's state
 * (plan 06, S-99). It stays in memory while the tab is open and not on screen, which is what makes
 * A → B → A lose nothing (S-100); the tree of the tab is gone meanwhile. Made, it is given back what
 * this browser kept of it (S-134).
 */
export function folderTabStore(path: string): FolderTabStore {
  const existing = stores.get(path);

  if (existing !== undefined) {
    return existing;
  }

  const created = createFolderTabStore();
  stores.set(path, created);
  restoreTab(path, tabRestorers.entries());
  return created;
}

/** A closed tab takes its state with it — what this browser kept of it too: opened again, it starts over. */
export function forgetFolderTab(path: string): void {
  forgetTab(path);
  stores.delete(path);
  letGo(path);
}

/**
 * Drops every tab's state, and what this browser kept of them — a sign-out: the next person to sign
 * in here starts from nothing (S-191). And the start of each test.
 */
export function forgetFolderTabs(): void {
  forgetTabs({ kept: true });
  stores.clear();
  letGo(null);
}

/** Lets go of every tab's state in memory and keeps what is saved — what a reload of the page does. */
export function releaseFolderTabs(): void {
  forgetTabs({ kept: false });
  stores.clear();
  letGo(null);
}

/**
 * Tells every part a tab keeps that its state in memory goes — one folder's, or every one's for
 * `null` — so a part with a store of its own (the Explorer's, plan 07) does not outlive the tab.
 */
function letGo(path: string | null): void {
  for (const restorer of tabRestorers.entries()) {
    restorer.forget?.(path);
  }
}
