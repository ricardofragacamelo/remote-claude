import { useTranslation } from 'react-i18next';

import { matchesSearch } from '@/features/commands';
import type { PaletteModeProps } from '@/features/commands';
import { CommandEmpty, CommandItem } from '@/shared/components/ui/command';
import { useRecentFolders } from '../hooks/useRecentFolders';
import { useFolderDialog } from '../store/folder-dialog.store';
import { RecentFolderLabel } from './RecentFolderLabel';

/**
 * "Open recent" in the palette: the recent folders that can still be opened, pinned first, narrowed
 * by name and path as it is typed — and "More…", the welcome screen, at the end.
 */
export function RecentFoldersMode({ query, pick }: PaletteModeProps): React.JSX.Element {
  const { t } = useTranslation();
  const recent = useRecentFolders();
  const routes = useFolderDialog((state) => state.routes);

  if (recent.isLoading) {
    return <CommandEmpty>{t('workspace.recentMenu.loading')}</CommandEmpty>;
  }

  if (recent.error !== null) {
    return <CommandEmpty>{t('workspace.recentMenu.unavailable')}</CommandEmpty>;
  }

  const folders = recent.folders.filter(
    (folder) =>
      folder.unavailable === null && matchesSearch(`${folder.name} ${folder.path}`, query),
  );

  return (
    <>
      {folders.map((folder) => (
        <CommandItem
          key={folder.path}
          value={folder.path}
          onSelect={() => {
            pick(() => {
              routes?.open(folder.path);
            });
          }}
        >
          <RecentFolderLabel folder={folder} />
        </CommandItem>
      ))}
      <CommandItem
        value="more"
        onSelect={() => {
          pick(() => {
            routes?.welcome();
          });
        }}
      >
        {t('workspace.recentMenu.more')}
      </CommandItem>
    </>
  );
}
