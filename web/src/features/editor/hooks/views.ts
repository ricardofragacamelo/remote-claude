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
