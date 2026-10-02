import { create } from 'zustand';

/** The parts of the editor's interface that are the page's, not a folder tab's. */
export interface EditorUiState {
  /** The folders whose editor is on screen, the latest last — the File menu acts on it. */
  readonly mounted: readonly string[];

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
  mount: (folder) => {
    set((state) => ({ mounted: [...state.mounted, folder] }));
    let mounted = true;

    return () => {
      if (mounted) {
        mounted = false;
        set((state) => {
          const at = state.mounted.lastIndexOf(folder);
          return { mounted: state.mounted.filter((_, index) => index !== at) };
        });
      }
    };
  },
}));

/** The folder whose editor is on screen — `null` while none is. */
export function mountedFolder(): string | null {
  return useEditorUi.getState().mounted.at(-1) ?? null;
}
