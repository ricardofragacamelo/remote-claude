import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { matchesSearch } from '@/features/commands';
import type { PaletteModeProps } from '@/features/commands';
import { CommandEmpty, CommandItem } from '@/shared/components/ui/command';
import { openFile } from '../hooks/tabs';
import { useMountedFolder } from '../hooks/useEditorUiState';
import { editorStoreOf } from '../store/editor.store';
import { RecentFileLabel } from './RecentFileLabel';

/** "Open recent file" in the palette: the folder tab's files opened last, narrowed as it is typed. */
export function RecentFilesMode(props: PaletteModeProps): React.JSX.Element {
  const { t } = useTranslation();
  const folder = useMountedFolder();

  return folder === null ? (
    <CommandEmpty>{t('editor.recent.empty')}</CommandEmpty>
  ) : (
    <RecentFilesOf folder={folder} {...props} />
  );
}

function RecentFilesOf({
  folder,
  query,
  pick,
}: PaletteModeProps & { readonly folder: string }): React.JSX.Element {
  const { t } = useTranslation();
  const recent = useStore(editorStoreOf(folder), (state) => state.recent).filter((path) =>
    matchesSearch(path, query),
  );

  if (recent.length === 0) {
    return <CommandEmpty>{t('editor.recent.empty')}</CommandEmpty>;
  }

  return (
    <>
      {recent.map((path) => (
        <CommandItem
          key={path}
          value={path}
          onSelect={() => {
            pick(() => {
              openFile(folder, path);
            });
          }}
        >
          <RecentFileLabel path={path} />
        </CommandItem>
      ))}
    </>
  );
}
