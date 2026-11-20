import { create } from 'zustand';

import { mountedStackAction } from '@/shared/lib/mounted-stack';
import type { MountedStackSlice } from '@/shared/lib/mounted-stack';

/** The parts of the editor's interface that are the page's, not a folder tab's. */
export interface EditorUiState extends MountedStackSlice {
  /** Whether the help of the editor is open (B-41). */
  readonly helpOpen: boolean;
  setHelpOpen(open: boolean): void;

  /** A folder's editor came on screen, until the returned function is called. */
  mount(folder: string): () => void;
}

/** The editor's interface state of the whole page. */
export const useEditorUi = create<EditorUiState>((set) => ({
  mounted: [],
  helpOpen: false,
  setHelpOpen: (helpOpen) => {
    set({ helpOpen });
  },
  mount: mountedStackAction(set),
}));

/** The folder whose editor is on screen — `null` while none is. */
export function mountedFolder(): string | null {
  return useEditorUi.getState().mounted.at(-1) ?? null;
}
