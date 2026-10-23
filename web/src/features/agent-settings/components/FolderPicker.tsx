import { useTranslation } from 'react-i18next';

import { FolderSelect } from '@/shared/components/FolderSelect';
import { useFolderChoices } from '../hooks/useFolderChoices';
import type { SectionBodyProps } from '../types/section';

/**
 * Which folder the section is about: none — the user's own defaults — or one of the open tabs and
 * the recent folders of the workbench (plan 13, B-16, S-182). The folder goes in the address, so the
 * link reproduces the screen; a folder the address names that is no longer among them still shows.
 */
export function FolderPicker({ location, onLocation }: SectionBodyProps): React.JSX.Element {
  const { t } = useTranslation();
  const choices = useFolderChoices(location.folder);

  return (
    <FolderSelect
      label={t('agentSettings.folder.label')}
      noneLabel={t('agentSettings.folder.none')}
      value={location.folder}
      choices={choices}
      onChange={(folder) => {
        onLocation(folder === undefined ? { section: location.section } : { ...location, folder });
      }}
    />
  );
}
