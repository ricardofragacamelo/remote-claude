import { FileSearch } from 'lucide-react';

import { useCommands, usePalette } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';

const DECLARATIONS: readonly CommandDeclaration[] = [
  {
    id: 'search.quickOpen',
    labelKey: 'command.search.quickOpen',
    category: 'file',
    icon: FileSearch,
    run: () => {
      // Blank, not entered by name: typing `>` still switches to the commands (S-108), which a
      // mode entered by name could never do (`modeFor` never re-checks a prefix once named).
      usePalette.getState().show(undefined, '');
    },
    keys: [{ key: 'Mod+P', context: 'global', allowInInput: true }],
  },
];

/**
 * `Ctrl/Cmd+P` opens Quick Open (plan 11, B-14) — mounted once, by `commandHosts`, the same way
 * an engine's own global shortcuts are: it needs no folder of its own, only the palette, which
 * already knows whose folder tab is on screen through `QuickOpenFolder`.
 */
export function QuickOpenShortcut(): null {
  useCommands(DECLARATIONS);
  return null;
}
