import { useCallback, useEffect } from 'react';
import { useStore } from 'zustand';

import { folderTabStore, useFolderTab } from '@/features/workbench';
import { claudePanelStore, tabKeyOf } from '../store/claude-panel.store';
import type { PanelTab } from '../store/claude-panel.store';
import { noteSessionFolder } from '../store/session-folders.store';

/** The conversations of the panel of a folder tab, and what can be done with them (plan 08, B-32). */
export interface PanelTabs {
  readonly tabs: readonly PanelTab[];
  readonly active: PanelTab | null;
  activate(key: string): void;

  /** Closes a tab — never the session it shows, which lives in the backend (S-150). */
  close(key: string): void;
  move(key: string, by: -1 | 1): void;
  newConversation(): void;

  /** The one before or after, going round at the ends — `±1`. */
  step(by: -1 | 1): void;
}

/** What the folder tab shows, as the panel's tab of it. */
function shownBy(sessionId: string | null, conversationId: string | null) {
  if (sessionId !== null) {
    return { kind: 'session', id: sessionId } as const;
  }

  return conversationId === null ? null : ({ kind: 'conversation', id: conversationId } as const);
}

/**
 * The conversations of the panel — drafts, live sessions and conversations of the history — kept
 * **in the folder tab**, never global (B-32), and the one on screen kept the same as what the tab
 * shows: what the address, the view of sessions or a resume put on the tab arrives as a tab of the
 * panel, and the tab picked in the panel is what the tab — and its address — shows.
 */
export function usePanelTabs(folder: string): PanelTabs {
  const panel = claudePanelStore(folder);
  const tabs = useStore(panel, (state) => state.tabs);
  const activeKey = useStore(panel, (state) => state.active);
  const { sessionId, conversationId } = useFolderTab(folder);

  // The tab's side into the panel: a session or a conversation arrives as its tab; nothing at all is
  // a draft — the one on screen, or a new one.
  useEffect(() => {
    const shown = shownBy(sessionId, conversationId);
    const state = panel.getState();

    if (shown !== null) {
      state.show(shown.kind, shown.id);
      return;
    }

    const current = state.tabs.find((tab) => tab.key === state.active);
    if (current?.kind !== 'draft') {
      const draft = state.tabs.find((tab) => tab.kind === 'draft');
      if (draft === undefined) {
        state.openDraft();
      } else {
        state.activate(draft.key);
      }
    }
  }, [conversationId, panel, sessionId]);

  /** The panel's side into the tab: what it shows is what the tab shows. */
  const showOnTab = useCallback(
    (tab: PanelTab | undefined) => {
      const folderTab = folderTabStore(folder).getState();

      if (tab?.kind === 'session') {
        if (folderTab.sessionId !== tab.sessionId) folderTab.showSession(tab.sessionId);
      } else if (tab?.kind === 'conversation') {
        if (folderTab.conversationId !== tab.conversationId)
          folderTab.showConversation(tab.conversationId);
      } else if (folderTab.sessionId !== null || folderTab.conversationId !== null) {
        folderTab.showSession(null);
      }
    },
    [folder],
  );

  const activate = useCallback(
    (key: string) => {
      panel.getState().activate(key);
      showOnTab(panel.getState().tabs.find((tab) => tab.key === key));
    },
    [panel, showOnTab],
  );

  return {
    tabs,
    active: tabs.find((tab) => tab.key === activeKey) ?? null,
    activate,
    close: useCallback(
      (key: string) => {
        panel.getState().close(key);
        const state = panel.getState();
        showOnTab(state.tabs.find((tab) => tab.key === state.active));
      },
      [panel, showOnTab],
    ),
    move: useCallback(
      (key: string, by: -1 | 1) => {
        panel.getState().move(key, by);
      },
      [panel],
    ),
    newConversation: useCallback(() => {
      panel.getState().openDraft();
      showOnTab(undefined);
    }, [panel, showOnTab]),
    step: useCallback(
      (by: -1 | 1) => {
        const state = panel.getState();
        const at = state.tabs.findIndex((tab) => tab.key === state.active);
        const next = state.tabs[(at + by + state.tabs.length) % state.tabs.length];
        if (next !== undefined) activate(next.key);
      },
      [activate, panel],
    ),
  };
}

/** The sessions open in the panel of a folder tab — what keeps them attached while not on screen. */
export function usePanelSessions(folder: string): readonly string[] {
  const tabs = useStore(claudePanelStore(folder), (state) => state.tabs);
  const { sessionId } = useFolderTab(folder);
  const ids = tabs.flatMap((tab) => (tab.kind === 'session' ? [tab.sessionId] : []));
  const all = sessionId === null || ids.includes(sessionId) ? ids : [...ids, sessionId];
  const key = all.join('\n');

  // Which folder each session is of — what a notice about it names, and where it leads.
  useEffect(() => {
    for (const id of key === '' ? [] : key.split('\n')) {
      noteSessionFolder(id, folder);
    }
  }, [folder, key]);

  return all;
}

/**
 * What was written in one tab of the panel and not sent yet — the tab's own, never shared, and given
 * back when the tab is on screen again (S-147).
 */
export function usePanelDraft(
  folder: string,
  key: string,
): { readonly text: string; setText(text: string): void } {
  const panel = claudePanelStore(folder);
  const text = useStore(panel, (state) => state.drafts[key] ?? '');

  return {
    text,
    setText: useCallback(
      (next: string) => {
        panel.getState().setDraft(key, next);
      },
      [key, panel],
    ),
  };
}

export { tabKeyOf };
