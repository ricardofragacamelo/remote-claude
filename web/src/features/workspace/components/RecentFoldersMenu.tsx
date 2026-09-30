import { useTranslation } from 'react-i18next';

import { afterClose } from '@/features/commands';
import { MenubarItem, MenubarSeparator } from '@/shared/components/ui/menubar';
import { useRecentFolders } from '../hooks/useRecentFolders';
import { useFolderDialog } from '../store/folder-dialog.store';
import { RecentFolderLabel } from './RecentFolderLabel';

/** How many recent folders the menu lists before "More…" — the welcome screen has them all. */
export const MENU_RECENTS = 10;

/**
 * File › Open recent: the recent folders, pinned first, and "More…" at the end, which is the
 * welcome screen (plan 06, B-25). A folder that can no longer be opened is listed, and not offered.
 */
export function RecentFoldersMenu(): React.JSX.Element {
  const { t } = useTranslation();
  const recent = useRecentFolders();
  const routes = useFolderDialog((state) => state.routes);
  const shown = recent.folders.slice(0, MENU_RECENTS);

  return (
    <>
      {recent.isLoading && <MenubarItem disabled>{t('workspace.recentMenu.loading')}</MenubarItem>}
      {recent.error !== null && (
        <MenubarItem disabled>{t('workspace.recentMenu.unavailable')}</MenubarItem>
      )}
      {!recent.isLoading && recent.error === null && shown.length === 0 && (
        <MenubarItem disabled>{t('workspace.recentMenu.empty')}</MenubarItem>
      )}
      {shown.map((folder) => (
        <MenubarItem
          key={folder.path}
          disabled={folder.unavailable !== null}
          onSelect={() => {
            afterClose(() => {
              routes?.open(folder.path);
            });
          }}
        >
          <RecentFolderLabel folder={folder} />
        </MenubarItem>
      ))}
      <MenubarSeparator />
      <MenubarItem
        onSelect={() => {
          afterClose(() => {
            routes?.welcome();
          });
        }}
      >
        {t('workspace.recentMenu.more')}
      </MenubarItem>
    </>
  );
}
