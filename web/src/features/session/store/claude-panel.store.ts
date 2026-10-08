import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import { perFolder } from '@/shared/lib/per-folder';
import type { ChangesFilter } from '../types/changes';
import type { ContextItem, ContextNotice } from '../types/context';

/** What the panel of Claude shows: the conversation, or what the session changed (plan 08, B-28). */
export type PanelPane = 'chat' | 'changes';

/** The levels of effort the installation may offer (D-16). */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * The modes a conversation can run in — Permitir tudo (`allowAll`) included, a mode of ours, and never
 * `bypassPermissions`, which this product never offers (ADR-022).
 */
export type PanelMode = 'default' | 'acceptEdits' | 'plan' | 'allowAll';

/** What a new conversation starts with — chosen in its draft, sent with `session.start` (D-07). */
export interface DraftChoices {
  /** `null` for the installation's default. */
  readonly model: string | null;
  readonly mode: PanelMode;
  readonly effort: EffortLevel | null;
}

export const DEFAULT_CHOICES: DraftChoices = { model: null, mode: 'default', effort: null };

/** One conversation of the panel: a draft, a live session, or one of the history, read only (B-32). */
export type PanelTab =
  | { readonly key: string; readonly kind: 'draft'; readonly choices: DraftChoices }
  | { readonly key: string; readonly kind: 'session'; readonly sessionId: string }
  | { readonly key: string; readonly kind: 'conversation'; readonly conversationId: string };

/** What a tab of a session or a conversation is named by — the same one is the same tab. */
export const tabKeyOf = (kind: 'session' | 'conversation', id: string): string => `${kind}:${id}`;

/** The files of one session marked as reviewed: path → the revision that was looked at. */
export type ReviewMarks = Readonly<Record<string, string>>;

/** How many sessions keep their marks; past it, the session marked longest ago forgets them. */
export const MAX_REVIEWED_SESSIONS = 20;

/** Where the conversation of a tab was scrolled to, and whether it was following its end. */
export interface ScrollMemory {
  readonly top: number;
  readonly following: boolean;
}

/** What the panel of Claude keeps **for one folder tab**. */
export interface ClaudePanelState {
  readonly pane: PanelPane;
  readonly changesFilter: ChangesFilter;

  /**
   * "Accepted": a mark of review, by session and file, of the version that was looked at — never on
   * the server nor in the trail, because accepting writes nothing (D-18). A later change of the
   * file is a new version, and pending again.
   */
  readonly reviewed: Readonly<Record<string, ReviewMarks>>;

  /** The conversations open in the panel, in order, and the one on screen (B-32). */
  readonly tabs: readonly PanelTab[];
  readonly active: string | null;

  /** What was being written in each tab and not sent yet — the tab's own, never shared. */
  readonly drafts: Readonly<Record<string, string>>;

  /**
   * The context of the next prompt of each tab — its chips (plan 08, B-47). The tab's own: two
   * conversations never share a set (S-225), and it stays until it is sent or cleared (S-221).
   */
  readonly contexts: Readonly<Record<string, readonly ContextItem[]>>;

  /** What the set of each tab said last — what an add left out, a drop refused. Never kept. */
  readonly notices: Readonly<Record<string, ContextNotice>>;

  /**
   * Where the conversation of each tab was left (plan 09, B-05): a look at the changes, a switch of
   * tab or a window crossing `md` gives it back as it was (S-08, S-16). Never kept across a reload.
   */
  readonly scrolls: Readonly<Record<string, ScrollMemory>>;

  /**
   * The effort each session opened here started with, by session (plan 09, S-90): a live session
   * only shows it — changing it would start the query again without the hook that asks before each
   * tool (08 · D-16). A session opened elsewhere is not in it, and its effort is not known here.
   */
  readonly efforts: Readonly<Record<string, EffortLevel | null>>;

  showPane(pane: PanelPane): void;

  /** Opens a new draft, and puts it on screen. @returns its key */
  openDraft(): string;

  /** Puts a session or a conversation on screen — the tab it already has, or a new one. */
  show(kind: 'session' | 'conversation', id: string): void;
  activate(key: string): void;

  /** Closes a tab — never the session it shows, which lives in the backend. */
  close(key: string): void;
  move(key: string, by: -1 | 1): void;
  setDraft(key: string, text: string): void;
  setContext(key: string, items: readonly ContextItem[]): void;
  setNotice(key: string, notice: ContextNotice | null): void;
  setScroll(key: string, memory: ScrollMemory): void;
  setChoices(key: string, choices: DraftChoices): void;

  /** A draft became a session: its tab is the session's now, in the same place. */
  promote(key: string, sessionId: string): void;
  setChangesFilter(filter: ChangesFilter): void;
  review(sessionId: string, files: readonly { path: string; revision: string }[]): void;
  unreview(sessionId: string, path: string): void;
}

export type ClaudePanelStore = StoreApi<ClaudePanelState>;

function createClaudePanelStore(): ClaudePanelStore {
  let drafts = 0;

  return createStore<ClaudePanelState>((set, get) => ({
    pane: 'chat',
    changesFilter: 'pending',
    reviewed: {},
    tabs: [],
    active: null,
    drafts: {},
    contexts: {},
    notices: {},
    scrolls: {},
    efforts: {},

    openDraft: () => {
      // A reload gives drafts back under their keys, and the count starts over: a key in use is
      // skipped, so two drafts are never one.
      let key = '';
      do {
        drafts += 1;
        key = `draft:${String(drafts)}`;
      } while (get().tabs.some((tab) => tab.key === key));

      set((state) => ({
        tabs: [...state.tabs, { key, kind: 'draft', choices: DEFAULT_CHOICES }],
        active: key,
      }));
      return key;
    },
    show: (kind, id) => {
      const key = tabKeyOf(kind, id);
      set((state) => ({
        tabs: state.tabs.some((tab) => tab.key === key)
          ? state.tabs
          : [...state.tabs, tabOf(kind, id, key)],
        active: key,
      }));
    },
    activate: (key) => {
      if (get().tabs.some((tab) => tab.key === key)) {
        set({ active: key });
      }
    },
    close: (key) => {
      set((state) => {
        const at = state.tabs.findIndex((tab) => tab.key === key);
        const tabs = state.tabs.filter((tab) => tab.key !== key);
        const neighbour = tabs[Math.min(Math.max(at, 0), tabs.length - 1)]?.key ?? null;
        return {
          tabs,
          drafts: without(state.drafts, key),
          contexts: without(state.contexts, key),
          notices: without(state.notices, key),
          scrolls: without(state.scrolls, key),
          active: state.active === key ? neighbour : state.active,
        };
      });
    },
    move: (key, by) => {
      set((state) => ({ tabs: moved(state.tabs, key, by) }));
    },
    setDraft: (key, text) => {
      set((state) => ({ drafts: { ...state.drafts, [key]: text } }));
    },
    setContext: (key, items) => {
      set((state) => ({
        contexts:
          items.length === 0 ? without(state.contexts, key) : { ...state.contexts, [key]: items },
      }));
    },
    setScroll: (key, memory) => {
      set((state) => ({ scrolls: { ...state.scrolls, [key]: memory } }));
    },
    setNotice: (key, notice) => {
      set((state) => ({
        notices:
          notice === null ? without(state.notices, key) : { ...state.notices, [key]: notice },
      }));
    },
    setChoices: (key, choices) => {
      set((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.key === key && tab.kind === 'draft' ? { ...tab, choices } : tab,
        ),
      }));
    },
    promote: (key, sessionId) => {
      const promoted = tabKeyOf('session', sessionId);
      set((state) => {
        const draft = state.tabs.find((tab) => tab.key === key);
        return {
          efforts:
            draft?.kind === 'draft'
              ? { ...state.efforts, [sessionId]: draft.choices.effort }
              : state.efforts,
          tabs: state.tabs
            .filter((tab) => tab.key !== promoted)
            .map((tab) => (tab.key === key ? tabOf('session', sessionId, promoted) : tab)),
          active: state.active === key ? promoted : state.active,
          drafts: without(state.drafts, key),
          // What the draft had and did not send — an upload that failed once the session opened,
          // say — goes on in the session's tab, never lost with the draft's key.
          contexts: movedContext(state.contexts, key, promoted),
        };
      });
    },

    showPane: (pane) => {
      set({ pane });
    },
    setChangesFilter: (changesFilter) => {
      set({ changesFilter });
    },
    review: (sessionId, files) => {
      set((state) => ({
        reviewed: latestSessions({
          ...withoutSession(state.reviewed, sessionId),
          [sessionId]: {
            ...state.reviewed[sessionId],
            ...Object.fromEntries(files.map((file) => [file.path, file.revision])),
          },
        }),
      }));
    },
    unreview: (sessionId, path) => {
      set((state) => {
        const marks = { ...state.reviewed[sessionId] };
        delete marks[path];
        return { reviewed: { ...state.reviewed, [sessionId]: marks } };
      });
    },
  }));
}

function without<T>(byTab: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(byTab).filter(([each]) => each !== key));
}

function movedContext(
  contexts: Readonly<Record<string, readonly ContextItem[]>>,
  from: string,
  to: string,
): Record<string, readonly ContextItem[]> {
  const items = contexts[from];
  const rest = without(contexts, from);

  return items === undefined ? rest : { ...rest, [to]: items };
}

function tabOf(kind: 'session' | 'conversation', id: string, key: string): PanelTab {
  return kind === 'session'
    ? { key, kind: 'session', sessionId: id }
    : { key, kind: 'conversation', conversationId: id };
}

/** The tabs with one moved a place towards an end — at the end already, it stays. */
function moved(tabs: readonly PanelTab[], key: string, by: -1 | 1): PanelTab[] {
  const from = tabs.findIndex((tab) => tab.key === key);
  const to = from + by;
  const next = [...tabs];

  if (from === -1 || to < 0 || to >= tabs.length) {
    return next;
  }

  const [tab] = next.splice(from, 1);
  if (tab !== undefined) {
    next.splice(to, 0, tab);
  }
  return next;
}

/** The marks without one session's — so writing it again moves it to the end, the newest. */
function withoutSession(
  reviewed: Readonly<Record<string, ReviewMarks>>,
  sessionId: string,
): Record<string, ReviewMarks> {
  return Object.fromEntries(Object.entries(reviewed).filter(([id]) => id !== sessionId));
}

/** The newest sessions' marks, within the ceiling. */
export function latestSessions(
  reviewed: Readonly<Record<string, ReviewMarks>>,
): Record<string, ReviewMarks> {
  return Object.fromEntries(Object.entries(reviewed).slice(-MAX_REVIEWED_SESSIONS));
}

const panels = perFolder(createClaudePanelStore);

/** The state of the panel **of one folder tab**, keyed by the folder's real path. */
export function claudePanelStore(folder: string): ClaudePanelStore {
  return panels.of(folder);
}

/** The tab closed — or, for `null`, every tab went: its panel's state goes with it. */
export function forgetClaudePanel(folder: string | null): void {
  panels.forget(folder);
}
