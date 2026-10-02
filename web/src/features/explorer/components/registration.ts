import { statusBarItems, tabRestorers, workbenchViews } from '@/features/workbench';
import { Files } from 'lucide-react';

import { EXPLORER_RESTORER } from '../store/explorer-restorer';
import { EXPLORER_VIEW, ExplorerStatusItem } from './ExplorerStatusItem';
import { ExplorerView } from './ExplorerView';

/**
 * Puts the Explorer in the workbench — once, at load, before any folder tab is made, since a tab is
 * given back what it kept the moment it is made (06 · D-31):
 *
 * - the view takes over the place of the activity bar plan 06 held for it;
 * - what a reload gives back joins the restoration of the tab;
 * - the item of the status bar follows the disk of the tab on screen and holds the commands that
 *   reach the Explorer from anywhere.
 *
 * @returns the way to take it all back out — the place goes back to its placeholder
 */
export function registerExplorer(): () => void {
  const undo = [
    workbenchViews.register({
      id: EXPLORER_VIEW,
      position: 100,
      labelKey: 'workbench.explorer.label',
      icon: Files,
      component: ExplorerView,
      placeholderKey: 'workbench.explorer.placeholder',
    }),
    tabRestorers.register(EXPLORER_RESTORER as Parameters<typeof tabRestorers.register>[0]),
    statusBarItems.register({
      id: 'explorer',
      side: 'left',
      position: 200,
      component: ExplorerStatusItem,
    }),
  ];

  return () => {
    for (const each of undo) {
      each();
    }
  };
}
