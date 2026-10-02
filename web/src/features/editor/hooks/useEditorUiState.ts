import { useEffect } from 'react';

import { useEditorChoice } from '../store/choice.store';
import type { ChoiceOption } from '../store/choice.store';
import { useEditorUi } from '../store/ui.store';

/** The help of the editor: whether it is open, and the ways to open and close it (B-41). */
export function useEditorUiState(): {
  readonly helpOpen: boolean;
  showHelp(): void;
  setHelpOpen(open: boolean): void;
} {
  const helpOpen = useEditorUi((state) => state.helpOpen);
  const setHelpOpen = useEditorUi((state) => state.setHelpOpen);

  return {
    helpOpen,
    setHelpOpen,
    showHelp: () => {
      setHelpOpen(true);
    },
  };
}

/** A folder's editor is on screen while the component that calls this is — the File menu acts on it. */
export function useMountedEditor(folder: string): void {
  useEffect(() => useEditorUi.getState().mount(folder), [folder]);
}

/** The folder whose editor is on screen, as React state — `null` while none is. */
export function useMountedFolder(): string | null {
  return useEditorUi((state) => state.mounted.at(-1) ?? null);
}

/** The choice the palette is showing (B-37): what it is about, and its options. */
export function useOfferedChoice(): {
  readonly titleKey: string;
  readonly options: readonly ChoiceOption[];
} {
  const titleKey = useEditorChoice((state) => state.titleKey);
  const options = useEditorChoice((state) => state.options);
  return { titleKey, options };
}
