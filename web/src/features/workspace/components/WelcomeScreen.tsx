import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useShortcut } from '@/features/commands';
import { Panel } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/button';
import { useFolderDialog } from '../store/folder-dialog.store';
import { RecentFolderList } from './RecentFolderList';
import { RootList } from './RootList';

export interface WelcomeScreenProps {
  /**
   * Opens a folder in the workbench. The route's to perform: the feature never learns the router
   * exists.
   */
  onOpen(path: string): void;
}

/**
 * The welcome screen, in the shape of the editor people already know: open a folder, the recent
 * ones, and the roots this installation allows.
 *
 * There is no "first root by default" anywhere here: the case that started plan 06 was a session
 * born in a folder nobody picked. Every way forward from this screen names the folder. The dialog is
 * the app's one "Open folder", and its shortcut is the one the registry has for it.
 */
export function WelcomeScreen({ onOpen }: WelcomeScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const show = useFolderDialog((state) => state.show);
  const shortcut = useShortcut('workspace.openFolder');

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title={t('workspace.welcome.startTitle')}
        description={t('workspace.welcome.startDescription')}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="touch"
            aria-keyshortcuts={shortcut?.aria}
            onClick={() => {
              show();
            }}
          >
            <FolderOpen className="size-4" aria-hidden />
            {t('workspace.welcome.openFolder')}
          </Button>
          {shortcut !== null && (
            <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">
              {shortcut.label}
            </kbd>
          )}
        </div>
      </Panel>

      <RecentFolderList onOpen={onOpen} />

      <RootList onBrowse={show} />
    </div>
  );
}
