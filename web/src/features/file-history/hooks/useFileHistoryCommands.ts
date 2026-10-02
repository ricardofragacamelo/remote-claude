import { CircleHelp, History, Trash2 } from 'lucide-react';

import { useCommands } from '@/features/commands';
import { timelineStore } from '../store/timeline.store';

/** The ids of the Timeline's commands — what its help lists, from the registry. */
export const TIMELINE_COMMANDS = [
  'fileHistory.showTimeline',
  'fileHistory.showRecentlyDeleted',
  'fileHistory.showHelp',
] as const;

/**
 * The commands that reach the Timeline from anywhere in the folder tab — in the palette, with their
 * shortcuts (S-352): its versions of the active file, the files deleted recently, and its help.
 *
 * @param reveal puts the view the Timeline is in on screen — the Explorer's, which owns it
 */
export function useFileHistoryCommands(folder: string, reveal: () => void): void {
  useCommands([
    {
      id: 'fileHistory.showTimeline',
      labelKey: 'fileHistory.command.showTimeline',
      category: 'view',
      icon: History,
      run: () => {
        reveal();
        timelineStore(folder).getState().reveal('file');
      },
      keys: [{ key: 'Mod+K H', context: 'workbench' }],
    },
    {
      id: 'fileHistory.showRecentlyDeleted',
      labelKey: 'fileHistory.command.showRecentlyDeleted',
      category: 'view',
      icon: Trash2,
      run: () => {
        reveal();
        timelineStore(folder).getState().reveal('deleted');
      },
      keys: [{ key: 'Mod+K D', context: 'workbench' }],
    },
    {
      id: 'fileHistory.showHelp',
      labelKey: 'fileHistory.command.help',
      category: 'help',
      icon: CircleHelp,
      run: () => {
        reveal();
        timelineStore(folder).getState().setHelpOpen(true);
      },
    },
  ]);
}
