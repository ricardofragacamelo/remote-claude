import { Search, SlidersHorizontal } from 'lucide-react';

import { commandHosts } from '@/app/command-hosts';
import { paletteModes } from '@/features/commands';
import type { PaletteMode } from '@/features/commands';
import { diffSources, fileChrome } from '@/features/editor';
import { settingsSections } from '@/features/settings';
import { tabRestorers, workbenchViews } from '@/features/workbench';
import type { TabRestorer } from '@/features/workbench';
import { QuickOpenMode } from './components/QuickOpenMode';
import { QuickOpenShortcut } from './components/QuickOpenShortcut';
import { ResultsEditorChrome } from './components/ResultsEditorChrome';
import { SearchActivityBadge } from './components/SearchActivityBadge';
import { SearchShortcut } from './components/SearchShortcut';
import { SEARCH_SETTING_OPTIONS, SearchSettings } from './components/SearchSettings';
import { SearchView } from './components/SearchView';
import { isCodeSearchFile } from './lib/code-search-format';
import { REPLACE_DIFF_READER } from './lib/replace-diff-source';
import { SEARCH_HISTORY_RESTORER } from './lib/search-history-restorer';

/**
 * The palette's empty-prefix mode (plan 06, `palette-filter.ts`'s `modeFor`): what is left once
 * `>` and any other registered prefix have been ruled out.
 */
const QUICK_OPEN_MODE: PaletteMode = {
  id: 'quickOpen',
  position: 150,
  prefix: '',
  placeholderKey: 'search.quickOpen.placeholder',
  component: QuickOpenMode,
};

/**
 * Puts Quick Open in the places of the shell it fills (plan 11, B-14): the palette's own mode, and
 * the `Ctrl/Cmd+P` that opens it.
 *
 * @returns the way to take it all back out
 */
export function registerSearch(): () => void {
  const undo = [
    paletteModes.register(QUICK_OPEN_MODE),
    commandHosts.register({ id: 'search', position: 150, component: QuickOpenShortcut }),
    commandHosts.register({ id: 'search.shortcut', position: 151, component: SearchShortcut }),
    diffSources.register(REPLACE_DIFF_READER),
    fileChrome.register({
      id: 'search.resultsEditor',
      position: 100,
      matches: isCodeSearchFile,
      component: ResultsEditorChrome,
    }),
    tabRestorers.register(SEARCH_HISTORY_RESTORER as TabRestorer),
    settingsSections.register({
      id: 'search',
      position: 310,
      labelKey: 'settings.section.search',
      icon: SlidersHorizontal,
      component: SearchSettings,
      options: SEARCH_SETTING_OPTIONS,
    }),
    workbenchViews.register({
      id: 'search',
      position: 200,
      labelKey: 'workbench.search.label',
      icon: Search,
      component: SearchView,
      placeholderKey: 'workbench.search.placeholder',
      badge: SearchActivityBadge,
    }),
  ];

  return () => {
    for (const each of undo) {
      each();
    }
  };
}

/** Takes Quick Open back out of the shell — what a test does to see it registered again. */
export const unregisterSearch = registerSearch();
