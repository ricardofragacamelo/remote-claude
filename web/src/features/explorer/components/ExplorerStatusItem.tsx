import { Crosshair, EyeOff, Files } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useCommands } from '@/features/commands';
import { activeFile, useActiveFile } from '@/features/editor';
import { useFileHistoryCommands } from '@/features/file-history';
import { useFolderTab } from '@/features/workbench';
import type { StatusItemProps } from '@/features/workbench';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { useExplorerState } from '../hooks/useExplorerState';
import { useFolderWatch } from '../hooks/useFolderWatch';
import { explorerStore } from '../store/explorer.store';
import { notFollowedKey } from './ExplorerNotices';

/** The id of the Explorer among the views of the activity bar — the place plan 06 held. */
export const EXPLORER_VIEW = 'explorer';

/**
 * The Explorer's part of a folder tab that is there whatever view is open — an item of the status
 * bar, which the workbench draws for the tab on screen:
 *
 * - it follows the disk of the folder (`workspace.watch`) while the tab is on screen, whether the
 *   tree is open or not, so the tree is current the moment it is shown (B-28);
 * - it says so when the folder is **not** followed — the one moment the tree can be stale (S-194);
 * - it holds the commands that reach the Explorer from anywhere: "Reveal in Explorer", which the
 *   editor's tab menu runs (S-178), "Show Explorer", and the Timeline's (07 · B-60).
 */
export function ExplorerStatusItem({ tab }: StatusItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const folder = tab.path;
  const view = useFolderTab(folder);
  const desktop = useIsDesktop();
  const active = useActiveFile(folder);
  const state = useExplorerState(folder);
  const warning = notFollowedKey(state.watch);

  useFolderWatch(folder, tab.state === 'available');

  const show = (): void => {
    view.showView(EXPLORER_VIEW);

    if (!desktop) {
      view.showMobile('explorer');
    }
  };

  useFileHistoryCommands(folder, show);
  useCommands([
    {
      id: 'explorer.revealActiveFile',
      labelKey: 'explorer.action.reveal',
      category: 'file',
      icon: Crosshair,
      when: () => active !== null,
      run: () => {
        const path = activeFile(folder);

        if (path !== null) {
          show();
          explorerStore(folder).getState().reveal(path);
        }
      },
      keys: [{ key: 'Shift+Alt+R', context: 'workbench' }],
    },
    {
      id: 'explorer.focus',
      labelKey: 'explorer.action.focus',
      category: 'view',
      icon: Files,
      run: () => {
        show();
        explorerStore(folder).getState().requestFocus();
      },
      keys: [{ key: 'Mod+Shift+E', context: 'workbench' }],
    },
  ]);

  if (warning === null) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t('explorer.status.notFollowed')}
          className="flex min-h-touch items-center gap-1 rounded-sm px-1 hover:bg-statusbar-foreground/10 md:min-h-0"
          onClick={show}
        >
          <EyeOff className="size-3.5" aria-hidden />
          {t('explorer.status.short')}
        </button>
      </TooltipTrigger>
      <TooltipContent>{t(warning)}</TooltipContent>
    </Tooltip>
  );
}
