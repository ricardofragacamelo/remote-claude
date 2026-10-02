import type { TextRange } from '@/shared/lib/files-drag';
import { activeGroupOf, activeTabOf } from '../lib/layout';
import { editorStoreOf } from '../store/editor.store';
import type { CodeView } from '../types/code-editor';

/** The views on screen, by folder and group — what a command acts on, and where the focus goes back. */
const views = new Map<string, CodeView>();

function keyOf(folder: string, group: string): string {
  return `${folder}\n${group}`;
}

/** A group's view is on screen, until the returned function is called. */
export function showView(folder: string, group: string, view: CodeView): () => void {
  const key = keyOf(folder, group);
  views.set(key, view);

  return () => {
    if (views.get(key) === view) {
      views.delete(key);
    }
  };
}

/** The view of the group with the focus — `null` when its tab is not a file in an editor. */
export function activeView(folder: string): CodeView | null {
  return views.get(keyOf(folder, editorStoreOf(folder).getState().activeGroup)) ?? null;
}

/** Gives the focus back to the editor — a dialog closed (S-268), a command that acts in it ran. */
export function focusEditor(folder: string): void {
  activeView(folder)?.focus();
}

/**
 * What is selected in the active editor of a folder tab — its file and every selection that is not
 * empty — or `null` with no editor, or nothing selected: the `@selection` of Claude's panel
 * (plan 08, B-48).
 */
export function activeSelections(
  folder: string,
): { readonly path: string; readonly ranges: readonly TextRange[] } | null {
  const tab = activeTabOf(activeGroupOf(editorStoreOf(folder).getState()));
  const ranges = activeView(folder)?.selections() ?? [];

  return tab?.kind !== 'file' || ranges.length === 0 ? null : { path: tab.path, ranges };
}
