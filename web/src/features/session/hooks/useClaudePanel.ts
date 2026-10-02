import { useStore } from 'zustand';

import { claudePanelStore } from '../store/claude-panel.store';
import type { ClaudePanelState, ReviewMarks } from '../store/claude-panel.store';
import type { ChangesFilter } from '../types/changes';

/** The panel of Claude of one folder tab: what it shows, and the way to change it. */
export function useClaudePanel(folder: string): Pick<ClaudePanelState, 'pane' | 'showPane'> {
  const store = claudePanelStore(folder);
  return { pane: useStore(store, (state) => state.pane), showPane: store.getState().showPane };
}

/** The marks of review of one session in a folder tab, and the filter of its changes. */
export function useReviewMarks(
  folder: string,
  sessionId: string,
): { readonly marks: ReviewMarks | undefined; readonly filter: ChangesFilter } {
  const store = claudePanelStore(folder);

  return {
    marks: useStore(store, (state) => state.reviewed[sessionId]),
    filter: useStore(store, (state) => state.changesFilter),
  };
}
