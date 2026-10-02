import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  folderTabStore,
  forgetFolderTab,
  forgetFolderTabs,
  releaseFolderTabs,
  tabRestorers,
} from '@/features/workbench/store/folder-tab.store';
import type { TabRestorer } from '@/features/workbench';

afterEach(() => {
  forgetFolderTabs();
});

/** A part of a tab with a store of its own, as the Explorer's is (plan 07). */
function aPartWithAStore(forget: (path: string | null) => void): TabRestorer<number> {
  return {
    id: 'probe.part',
    position: 900,
    version: 1,
    parse: () => undefined,
    capture: () => 0,
    apply: () => undefined,
    subscribe: () => () => undefined,
    forget,
  };
}

describe('a part with a store of its own goes with its tab — plan 07, B-24', () => {
  it('is told when one tab closes, and when every tab goes', () => {
    const forget = vi.fn();
    const unregister = tabRestorers.register(aPartWithAStore(forget) as TabRestorer);

    try {
      folderTabStore('/srv/a');
      forgetFolderTab('/srv/a');
      expect(forget).toHaveBeenLastCalledWith('/srv/a');

      releaseFolderTabs();
      expect(forget).toHaveBeenLastCalledWith(null);

      forgetFolderTabs();
      expect(forget).toHaveBeenCalledTimes(3);
    } finally {
      unregister();
    }
  });
});
