import { Replace, Search } from 'lucide-react';

import { useCommands } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import { activeSelectionText } from '@/features/editor';
import { folderTabStore } from '@/features/workbench';
import { useQuickOpenFolder } from '../hooks/useQuickOpenFolder';
import { searchViewStore } from '../store/search-view.store';

/**
 * `Ctrl/Cmd+Shift+F` and `Ctrl/Cmd+Shift+H` switch the side bar to Search, the second opening the
 * replace row too — with the editor's own selection, if there is one, filling the query (plan 11,
 * B-15, S-119; B-19). Mounted once, global, the same way the engine's own shortcuts are: it needs
 * no folder of its own, only the one on screen, which Quick Open already tracks.
 */
export function SearchShortcut(): null {
  const folder = useQuickOpenFolder();

  const openSearch = (replaceOpen: boolean): void => {
    if (folder === null) {
      return;
    }

    const selection = activeSelectionText(folder);
    if (selection !== null && selection !== '') {
      searchViewStore(folder).getState().setQuery(selection);
    }
    if (replaceOpen) {
      searchViewStore(folder).getState().setReplaceOpen(true);
    }
    folderTabStore(folder).getState().showView('search');
  };

  const declarations: readonly CommandDeclaration[] = [
    {
      id: 'search.openSearch',
      labelKey: 'command.search.openSearch',
      category: 'file',
      icon: Search,
      when: () => folder !== null,
      run: () => {
        openSearch(false);
      },
      keys: [{ key: 'Mod+Shift+F', context: 'global', allowInInput: true }],
    },
    {
      id: 'search.openReplace',
      labelKey: 'command.search.openReplace',
      category: 'file',
      icon: Replace,
      when: () => folder !== null,
      run: () => {
        openSearch(true);
      },
      keys: [{ key: 'Mod+Shift+H', context: 'global', allowInInput: true }],
    },
  ];

  useCommands(declarations);
  return null;
}
