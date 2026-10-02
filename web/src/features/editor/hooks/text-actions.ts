import { addToClaudeContext, filesDragPayload } from '@/shared/lib/files-drag';
import type { TextRange } from '@/shared/lib/files-drag';
import { convertIndentation } from '../lib/text';
import { editorStoreOf, isDirty, updateDoc } from '../store/editor.store';
import { useEditorPreferences } from '../store/preferences.store';
import type { LineEnding } from '../types/code-editor';
import { readAgain, withModel } from './documents';
import { save } from './saving';

/** Says something once, to a screen reader and on screen (S-277). */
export function announce(
  folder: string,
  key: string,
  params: Readonly<Record<string, unknown>> = {},
): void {
  editorStoreOf(folder).setState({ announcement: { key, params, at: Date.now() } });
}

/** Converts a file's line endings — an edit: the tab is dirty, and the save writes it (S-248). */
export function changeEol(folder: string, path: string, eol: LineEnding): void {
  editorStoreOf(folder).getState().docs[path]?.model?.setEol(eol);
}

/** Highlights a file as another language, by hand (S-251). */
export function changeLanguage(folder: string, path: string, language: string): void {
  editorStoreOf(folder).getState().docs[path]?.model?.setLanguage(language);
}

/**
 * Converts the indentation of a file — tabs to spaces or back, at its indentation size — as one edit
 * that can be undone, and edits it that way from now on (S-251).
 */
export function changeIndentation(folder: string, path: string, insertSpaces: boolean): void {
  const open = withModel(folder, path);

  if (open !== null) {
    const size = open.doc.indentation?.size ?? useEditorPreferences.getState().preferences.tabSize;
    open.model.setValue(convertIndentation(open.model.getValue(), insertSpaces, size));
    updateDoc(editorStoreOf(folder), path, () => ({ indentation: { insertSpaces, size } }));
  }
}

/**
 * "Reopen with encoding" (S-249): the file read again, decoded with the encoding picked. A dirty
 * buffer would be lost by it, so it is refused until it is saved or reverted — said, not silent.
 */
export async function reopenWithEncoding(
  folder: string,
  path: string,
  encoding: string,
): Promise<void> {
  const doc = editorStoreOf(folder).getState().docs[path];

  if (doc === undefined) {
    return;
  }

  if (isDirty(doc)) {
    announce(folder, 'editor.encoding.dirty', { path });
    return;
  }

  await readAgain(folder, path, { encoding });
}

/**
 * "Save with encoding" (S-249): the buffer written in another encoding. A character the encoding
 * cannot hold is `FILE_NOT_ENCODABLE`, said in words, and nothing is written (S-250).
 */
export async function saveWithEncoding(
  folder: string,
  path: string,
  encoding: string,
): Promise<void> {
  await save(folder, path, { encoding });
}

/**
 * Hands a file — or a selection of it, with its range — to Claude's context (B-42), and says how it
 * went. Repeating it hands it again: dropping repeats is the target's (S-278).
 */
export function addFileToClaude(folder: string, path: string, range: TextRange | null): void {
  const { payload } = filesDragPayload(
    folder,
    range === null ? [{ path, kind: 'file' }] : [],
    range === null ? undefined : { path, range },
  );
  const taken = payload !== null && addToClaudeContext(payload);

  announce(folder, taken ? 'editor.claude.added' : 'editor.claude.unavailable', { path });
}
