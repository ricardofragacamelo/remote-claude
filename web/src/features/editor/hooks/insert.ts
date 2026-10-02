import { logger } from '@/shared/logging/logger';
import { editorStoreOf } from '../store/editor.store';
import { activeFile } from './tabs';
import { activeView } from './views';

/** Why text cannot be put in the editor of a folder now — or `null` when it can. */
export type InsertBlocker = 'noEditor' | 'notLoaded';

/** Whether the editor of the folder tab can take text at its cursor now, and why not. */
export function insertBlocker(folder: string): InsertBlocker | null {
  const path = activeFile(folder);

  if (path === null || activeView(folder) === null) {
    return 'noEditor';
  }

  return editorStoreOf(folder).getState().docs[path]?.model == null ? 'notLoaded' : null;
}

/** Where a 1-based line and column fall in a text, as an offset. */
function offsetOf(text: string, line: number, column: number): number {
  const lines = text.split('\n');
  const before = lines
    .slice(0, Math.max(0, line - 1))
    .reduce((sum, each) => sum + each.length + 1, 0);
  const width = lines[line - 1]?.length ?? 0;

  return Math.min(text.length, before + Math.min(Math.max(0, column - 1), width));
}

/**
 * Puts text at the cursor of the active editor of a folder tab — "insert in the editor" of a code
 * block of Claude's answer (plan 08, B-15).
 *
 * An edit of the buffer, which leaves the file dirty and can be undone; **never** a write to the
 * disk — saving stays the person's (S-67). The cursor ends after what was put there.
 *
 * @returns whether it was put — not when there is no editor on screen, or its file is not read yet
 */
export function insertIntoEditor(folder: string, text: string): boolean {
  const path = activeFile(folder);
  const view = activeView(folder);
  const model = path === null ? null : editorStoreOf(folder).getState().docs[path]?.model;

  if (path === null || view === null || model == null) {
    return false;
  }

  const before = model.getValue();
  const at = view.position();
  const offset = offsetOf(before, at.line, at.column);
  model.setValue(`${before.slice(0, offset)}${text}${before.slice(offset)}`);

  const breaks = text.split('\n').length - 1;
  const last = text.slice(text.lastIndexOf('\n') + 1);
  view.setPosition({
    line: at.line + breaks,
    column: breaks === 0 ? at.column + last.length : last.length + 1,
  });
  view.focus();

  logger.debug(
    { op: 'editor.insert', folder, path, length: text.length },
    'text put at the cursor',
  );
  return true;
}
