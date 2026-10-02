import { activeSelections } from '@/features/editor';
import { claudeContextTargets } from '@/shared/lib/files-drag';
import type { FilesDragPayload } from '@/shared/lib/files-drag';
import { addToSet } from './hooks/useContextSet';
import { itemId, itemsOfPayload, UNCHECKED } from './lib/context-set';
import { mentionProviders } from './lib/mention-providers';
import { claudePanelStore } from './store/claude-panel.store';
import type { ContextItem } from './types/context';

/**
 * The conversation of a folder tab's panel that takes what is added to Claude's context: the one on
 * screen when it can take a prompt — a draft or a session —, or a new draft when it cannot.
 */
function receivingTab(folder: string): string {
  const panel = claudePanelStore(folder);
  const { tabs, active } = panel.getState();
  const shown = tabs.find((tab) => tab.key === active);

  return shown !== undefined && shown.kind !== 'conversation'
    ? shown.key
    : panel.getState().openDraft();
}

/**
 * What the tree, the tabs and the editor hand to Claude's context, put in the context of the
 * conversation on screen in the panel of the **same** folder tab (plan 08, B-49, B-51). The payload
 * is the folder's own, so nothing is re-scoped here; what passes the ceiling is said on the set.
 */
export function addToPanelContext(payload: FilesDragPayload): void {
  const panel = claudePanelStore(payload.folder);
  const key = receivingTab(payload.folder);

  panel.getState().setNotice(key, addToSet(panel, key, itemsOfPayload(payload)));
}

/** `@selection`: what is selected in the active editor of the tab — one range per cursor. */
function selectionItems(folder: string): readonly ContextItem[] | null {
  const selected = activeSelections(folder);

  return selected === null
    ? null
    : selected.ranges.map((range) => ({
        id: itemId(),
        kind: 'range',
        path: selected.path,
        startLine: range.startLine,
        endLine: range.endLine,
        ...UNCHECKED,
      }));
}

/**
 * Puts the panel where Claude's context is fed (plan 08, F5) — once, at load: the target of "Add to
 * Claude's context" and of the drag towards the chat of plan 07, and the `@selection` of the
 * composer. `@terminal` is the integrated terminal's to register (plan 12).
 *
 * @returns the way to take it back out
 */
export function registerClaudeContext(): () => void {
  const undo = [
    claudeContextTargets.register({ id: 'session.panel', position: 100, add: addToPanelContext }),
    mentionProviders.register({
      id: 'session.selection',
      position: 100,
      keyword: 'selection',
      labelKey: 'composer.mention.selection',
      descriptionKey: 'composer.mention.selectionHint',
      items: selectionItems,
    }),
  ];

  return () => {
    for (const each of undo) {
      each();
    }
  };
}
