import { create } from 'zustand';

import { mountedStackAction } from '@/shared/lib/mounted-stack';
import type { MountedStackSlice } from '@/shared/lib/mounted-stack';

/** The parts of the feature's interface that are the page's, not one folder tab's. */
export interface SearchUiState extends MountedStackSlice {
  /** A folder's workbench came on screen, until the returned function is called. */
  mount(folder: string): () => void;
}

/**
 * Mirrors `editor/store/ui.store.ts`'s own "mounted folder" — Quick Open needs the same thing a
 * palette mode gets no prop for, and has no editor-private state of its own to reach into.
 */
export const useSearchUi = create<SearchUiState>((set) => ({
  mounted: [],
  mount: mountedStackAction(set),
}));
