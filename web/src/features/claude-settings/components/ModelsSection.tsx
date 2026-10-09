import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { LoadStatus } from '@/shared/components/LoadStatus';
import { useDefaults } from '../hooks/useDefaults';
import type { Defaults } from '../hooks/useDefaults';
import { NO_DEFAULTS } from '../types/defaults';
import type { DefaultsView } from '../types/defaults';
import type { SectionBodyProps } from './section-views';
import { DefaultsForm } from './DefaultsForm';
import { FolderPicker } from './FolderPicker';

/**
 * "Modelos e padrões": the models of the installation, and the defaults a new session starts with —
 * the user's, and the override of the folder in the address, which applies to its subfolders too
 * (plan 13, B-13, B-14, B-16). A session already running does not change: switching inside one is
 * the panel's selector.
 */
export function ModelsSection({ location, onLocation }: SectionBodyProps): React.JSX.Element {
  const { t } = useTranslation();
  const defaults = useDefaults(location.folder);
  const { view, models } = defaults;

  return (
    <div className="flex flex-col gap-4">
      <FolderPicker location={location} onLocation={onLocation} />
      <LoadStatus
        isLoading={defaults.isLoading}
        loadingLabel={t('claudeSettings.models.loading')}
        error={defaults.error}
        onRetry={defaults.retry}
        rows={6}
      />
      {/* No list, or an empty one: the selector offers only the installation's default (S-36). */}
      {defaults.noModels && (
        <EmptyState
          title={t('claudeSettings.models.noModelsTitle')}
          description={t('claudeSettings.models.noModelsBody')}
        />
      )}
      {view !== null && (
        <>
          <DefaultsForm
            key={JSON.stringify(view.user)}
            heading={t('claudeSettings.models.forUser')}
            values={view.user}
            effective={location.folder === undefined ? view.effective : null}
            models={models}
            saving={defaults.saving}
            error={defaults.saveError}
            onSave={(values) => {
              defaults.save('user', values);
            }}
          />
          {location.folder !== undefined && (
            <FolderForm folder={location.folder} view={view} defaults={defaults} />
          )}
        </>
      )}
    </div>
  );
}

/** The override of the folder of the address, which applies to its subfolders too. */
function FolderForm({
  folder,
  view,
  defaults,
}: {
  readonly folder: string;
  readonly view: DefaultsView;
  readonly defaults: Defaults;
}): React.JSX.Element {
  const { t } = useTranslation();
  const stored = view.folder?.values ?? NO_DEFAULTS;

  return (
    <DefaultsForm
      key={`${folder}:${JSON.stringify(stored)}`}
      heading={t('claudeSettings.models.forFolder', { folder })}
      values={stored}
      effective={view.effective}
      models={defaults.models}
      saving={defaults.saving}
      error={defaults.saveError}
      onSave={(values) => {
        defaults.save('folder', values);
      }}
      {...(view.folder === null ? {} : { onClear: defaults.clearFolder })}
    />
  );
}
