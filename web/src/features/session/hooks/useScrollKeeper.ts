import { useMemo } from 'react';

import { claudePanelStore } from '../store/claude-panel.store';
import type { ScrollKeeper } from './useFollowTail';

/**
 * Where the conversation of one tab of the panel was left, kept by the panel of its folder tab
 * (plan 09, B-05) — never by the component, which a switch of pane or of layout takes down.
 *
 * @param key the tab, or `null` for what is not a conversation to follow — the changes of a session
 */
export function useScrollKeeper(folder: string, key: string | null): ScrollKeeper | null {
  return useMemo(() => {
    if (key === null) {
      return null;
    }

    const panel = claudePanelStore(folder);

    return {
      key,
      read: () => panel.getState().scrolls[key],
      write: (memory) => {
        panel.getState().setScroll(key, memory);
      },
    };
  }, [folder, key]);
}
