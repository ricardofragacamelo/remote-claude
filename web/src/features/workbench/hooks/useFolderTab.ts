import { useStore } from 'zustand';

import { folderTabStore } from '../store/folder-tab.store';
import type { FolderTabUiState } from '../store/folder-tab.store';

/**
 * The state of one folder tab, and what can be done to it.
 *
 * The same store for both layouts — side by side from `md` up, one view at a time below it — so
 * making the window narrower or wider loses nothing (plan 06, S-118).
 */
export function useFolderTab(path: string): FolderTabUiState {
  return useStore(folderTabStore(path));
}
