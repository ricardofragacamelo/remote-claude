import { Folder, Pin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { RecentFolder } from '../types/workspace';

/**
 * A recent folder as a line of a menu or of the palette: pinned or not, its name, and its path — the
 * same in the File menu and in "Open recent" of the palette.
 */
export function RecentFolderLabel({
  folder,
}: {
  readonly folder: RecentFolder;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      {folder.pinned ? (
        <Pin className="size-4 shrink-0" aria-label={t('workspace.recent.pinned')} />
      ) : (
        <Folder className="size-4 shrink-0" aria-hidden />
      )}
      <span className="truncate">{folder.name}</span>
      <span className="ml-auto truncate pl-4 font-code text-ui-sm text-muted-foreground">
        {folder.path}
      </span>
    </>
  );
}
