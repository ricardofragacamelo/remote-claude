import { useStore } from 'zustand';

import { explorerStore } from '../store/explorer.store';
import type { ExplorerState } from '../store/explorer.store';

/** The Explorer of one folder tab, as React state — the tab's own, never another's (S-12). */
export function useExplorerState(folder: string): ExplorerState {
  return useStore(explorerStore(folder));
}
