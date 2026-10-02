import { useTranslation } from 'react-i18next';

import { useScreenShortcuts } from '@/features/commands';
import { HelpSheet } from '@/shared/components/HelpSheet';
import type { Explorer } from '../hooks/useExplorer';
import { TransferHelp } from './TransferHelp';

/** The shortcuts the help lists — read from the registry, never written twice (web/03). */
export const HELP_SHORTCUTS = [
  'explorer.open',
  'explorer.openToSide',
  'explorer.rename',
  'explorer.delete',
  'explorer.undo',
  'explorer.copy',
  'explorer.cut',
  'explorer.paste',
  'explorer.duplicate',
  'explorer.moveTo',
  'explorer.newFile',
  'explorer.newFolder',
  'explorer.newFromTemplate',
  'explorer.copyPath',
  'explorer.copyRelativePath',
  'explorer.compareSelected',
  'explorer.addToContext',
  'explorer.uploadFiles',
  'explorer.uploadFolder',
  'explorer.download',
  'explorer.refresh',
  'explorer.collapseAll',
  'explorer.toggleHidden',
  'explorer.filter',
  'explorer.focus',
  'explorer.revealActiveFile',
  'fileHistory.showTimeline',
  'fileHistory.showRecentlyDeleted',
] as const;

/**
 * The help of the Explorer, written for somebody who has never seen the product (S-198): what the
 * tree is, what "hidden" hides and what is not followed, what `Ctrl+Z` undoes and what is for good,
 * what the icon of a link out of the folder means — and its shortcuts, from the registry. A sheet of
 * its own, opened by its button and the palette; `Shift+F1` stays the workbench's.
 */
export function ExplorerHelp({ explorer }: { readonly explorer: Explorer }): React.JSX.Element {
  const { t } = useTranslation();
  const shortcuts = useScreenShortcuts(HELP_SHORTCUTS);

  return (
    <HelpSheet
      title={t('explorer.screen.title')}
      purpose={t('explorer.screen.purpose')}
      help="explorer.help"
      shortcuts={shortcuts}
      own={{ open: explorer.helpOpen, onOpenChange: explorer.setHelpOpen }}
      extra={[
        {
          id: 'transfer',
          heading: t('explorer.help.transferHeading'),
          body: <TransferHelp limits={explorer.transfer.limits} />,
        },
      ]}
    />
  );
}
