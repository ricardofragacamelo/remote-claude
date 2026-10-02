import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { afterClose } from '@/features/commands';
import { MenubarItem } from '@/shared/components/ui/menubar';
import { openFile } from '../hooks/tabs';
import { useMountedFolder } from '../hooks/useEditorUiState';
import { editorStoreOf } from '../store/editor.store';
import { RecentFileLabel } from './RecentFileLabel';

/**
 * File › Open recent file: the files opened last in the folder tab on screen, newest first (S-219) —
 * the folder's own list, never another tab's.
 */
export function RecentFilesMenu(): React.JSX.Element {
  const { t } = useTranslation();
  const folder = useMountedFolder();

  if (folder === null) {
    return <MenubarItem disabled>{t('editor.recent.empty')}</MenubarItem>;
  }

  return <RecentFilesOf folder={folder} />;
}

function RecentFilesOf({ folder }: { readonly folder: string }): React.JSX.Element {
  const { t } = useTranslation();
  const recent = useStore(editorStoreOf(folder), (state) => state.recent);

  if (recent.length === 0) {
    return <MenubarItem disabled>{t('editor.recent.empty')}</MenubarItem>;
  }

  return (
    <>
      {recent.map((path) => (
        <MenubarItem
          key={path}
          onSelect={() => {
            afterClose(() => {
              openFile(folder, path);
            });
          }}
        >
          <RecentFileLabel path={path} />
        </MenubarItem>
      ))}
    </>
  );
}
