import { ChevronsLeft, ChevronsRight, Hash, PanelBottom, PanelLeft, X } from 'lucide-react';

import { useCommands, useKeyContext } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import { folderTabStore } from '../store/folder-tab.store';
import type { FolderTabs } from './useFolderTabs';

/** How many tabs have a shortcut of their own: `Alt+1` … `Alt+9`. */
const NUMBERED_TABS = 9;

/** The tab `by` places away from the active one, going round at the ends. */
function neighbourOf(control: FolderTabs, by: -1 | 1): string {
  const paths = control.tabs.map((tab) => tab.path);
  const at = paths.indexOf(control.active);

  return paths[(at + by + paths.length) % paths.length] ?? control.active;
}

/**
 * The commands of the folder tabs, live while the workbench is on screen.
 *
 * Switching tabs never uses a key the browser keeps for its own tabs: `Alt+1…9` goes to a tab, and
 * `Ctrl+Alt+PageUp/PageDown` — `Cmd+Alt+←/→` on a Mac — to the one before and after (06 · D-16,
 * S-122). Closing a tab has no shortcut at all — `Ctrl+W` is the browser's — and is in the palette
 * and the File menu, where it asks first, like the × of the tab.
 */
export function useWorkbenchCommands(control: FolderTabs): void {
  useKeyContext('workbench');

  const layout = (): ReturnType<ReturnType<typeof folderTabStore>['getState']> =>
    folderTabStore(control.active).getState();

  const declarations: CommandDeclaration[] = [
    {
      id: 'workbench.closeFolderTab',
      labelKey: 'command.workbench.closeFolderTab',
      category: 'file',
      icon: X,
      fileMenu: { group: 'close', order: 200 },
      run: () => {
        control.askClose([control.active]);
      },
    },
    {
      id: 'workbench.nextFolderTab',
      labelKey: 'command.workbench.nextFolderTab',
      category: 'view',
      icon: ChevronsRight,
      when: () => control.tabs.length > 1,
      run: () => {
        control.activate(neighbourOf(control, 1));
      },
      keys: [{ key: 'Ctrl+Alt+PageDown', mac: 'Mod+Alt+ArrowRight', context: 'workbench' }],
    },
    {
      id: 'workbench.previousFolderTab',
      labelKey: 'command.workbench.previousFolderTab',
      category: 'view',
      icon: ChevronsLeft,
      when: () => control.tabs.length > 1,
      run: () => {
        control.activate(neighbourOf(control, -1));
      },
      keys: [{ key: 'Ctrl+Alt+PageUp', mac: 'Mod+Alt+ArrowLeft', context: 'workbench' }],
    },
    ...Array.from({ length: NUMBERED_TABS }, (_, index): CommandDeclaration => {
      const place = index + 1;

      return {
        id: `workbench.folderTab${String(place)}`,
        labelKey: 'command.workbench.goToFolderTab',
        labelParams: { place },
        category: 'view',
        icon: Hash,
        when: () => control.tabs.length >= place,
        run: () => {
          const tab = control.tabs[index];
          if (tab !== undefined) {
            control.activate(tab.path);
          }
        },
        keys: [{ key: `Alt+${String(place)}`, context: 'workbench' }],
      };
    }),
    {
      id: 'workbench.toggleSideBar',
      labelKey: 'command.workbench.toggleSideBar',
      category: 'view',
      icon: PanelLeft,
      run: () => {
        layout().toggleSideBar();
      },
      keys: [{ key: 'Mod+B', context: 'workbench' }],
    },
    {
      id: 'workbench.togglePanel',
      labelKey: 'command.workbench.togglePanel',
      category: 'view',
      icon: PanelBottom,
      run: () => {
        layout().togglePanel();
      },
      keys: [{ key: 'Mod+J', context: 'workbench' }],
    },
  ];

  useCommands(declarations);
}
