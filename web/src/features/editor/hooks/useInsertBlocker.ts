import { useStore } from 'zustand';

import { editorStoreOf } from '../store/editor.store';
import { insertBlocker } from './insert';
import type { InsertBlocker } from './insert';

/**
 * Why the editor of a folder tab cannot take text at its cursor now — or `null` — following the
 * editor as tabs open, close and load: the button that inserts is disabled with the reason (S-68).
 */
export function useInsertBlocker(folder: string): InsertBlocker | null {
  // Subscribed for the re-render; the answer is read from the editor as it is now.
  useStore(
    editorStoreOf(folder),
    (state) => `${state.activeGroup}\n${String(state.groups.length)}`,
  );
  useStore(editorStoreOf(folder), (state) => state.docs);

  return insertBlocker(folder);
}
