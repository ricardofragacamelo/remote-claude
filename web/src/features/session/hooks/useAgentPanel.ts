import { useStore } from 'zustand';

import { agentPanelStore } from '../store/agent-panel.store';
import type { AgentPanelState, ReviewMarks } from '../store/agent-panel.store';
import type { ChangesFilter } from '../types/changes';

/** The panel of the agent of one folder tab: what it shows, and the way to change it. */
export function useAgentPanel(folder: string): Pick<AgentPanelState, 'pane' | 'showPane'> {
  const store = agentPanelStore(folder);
  return { pane: useStore(store, (state) => state.pane), showPane: store.getState().showPane };
}

/** The marks of review of one session in a folder tab, and the filter of its changes. */
export function useReviewMarks(
  folder: string,
  sessionId: string,
): { readonly marks: ReviewMarks | undefined; readonly filter: ChangesFilter } {
  const store = agentPanelStore(folder);

  return {
    marks: useStore(store, (state) => state.reviewed[sessionId]),
    filter: useStore(store, (state) => state.changesFilter),
  };
}
