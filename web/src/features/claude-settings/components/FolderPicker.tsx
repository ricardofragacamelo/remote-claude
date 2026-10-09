import { useTranslation } from 'react-i18next';

import { useFolderChoices } from '../hooks/useFolderChoices';
import type { SectionBodyProps } from './section-views';

/**
 * Which folder the section is about: none — the user's own defaults — or one of the open tabs and
 * the recent folders of the workbench (plan 13, B-16, S-182). The folder goes in the address, so the
 * link reproduces the screen; a folder the address names that is no longer among them still shows.
 */
export function FolderPicker({ location, onLocation }: SectionBodyProps): React.JSX.Element {
  const { t } = useTranslation();
  const choices = useFolderChoices(location.folder);

  return (
    <label className="flex flex-col gap-1 text-ui-sm md:max-w-md">
      {t('claudeSettings.folder.label')}
      <select
        className="h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8"
        value={location.folder ?? ''}
        onChange={(event) => {
          const folder = event.target.value;
          onLocation(folder === '' ? { section: location.section } : { ...location, folder });
        }}
      >
        <option value="">{t('claudeSettings.folder.none')}</option>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  );
}
