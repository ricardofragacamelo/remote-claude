import { useEffect } from 'react';

import { aDocument, editorStoreOf } from '../store/editor.store';
import type { FileDocument } from '../types/editor';
import { ensureLoaded } from './documents';
import { useDocument } from './useEditor';

/** What a text preview draws: the text, and how far reading it went. */
export interface PreviewText {
  readonly doc: FileDocument | undefined;

  /** The buffer as it is now — unsaved changes included — or what was read, before an editor made it. */
  readonly text: string | null;
}

/** Makes sure a preview's file is open and read — a preview restored by a reload opened nothing. */
function hold(folder: string, path: string): void {
  const store = editorStoreOf(folder);

  if (store.getState().docs[path] === undefined) {
    store.setState((state) => ({ docs: { ...state.docs, [path]: aDocument(path) } }));
  }

  void ensureLoaded(folder, path);
}

/**
 * The text of a file for its preview — **the buffer**, not the disk: what is typed in an editor of
 * the file shows in its preview as it is typed, saved or not (S-312). The document re-renders on
 * every edit, because each one moves its version.
 */
export function usePreviewText(folder: string, path: string): PreviewText {
  const doc = useDocument(folder, path);

  useEffect(() => {
    hold(folder, path);
  }, [folder, path]);

  return { doc, text: doc?.model?.getValue() ?? doc?.pending ?? null };
}
