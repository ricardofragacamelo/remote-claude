import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { LoadStatus } from '@/shared/components/LoadStatus';
import { defaultsExtraFields } from '../store/defaults-extra-fields';
import type { DefaultsExtraField } from '../store/defaults-extra-fields';
import { useDefaults } from '../hooks/useDefaults';
import type { Defaults } from '../hooks/useDefaults';
import { NO_DEFAULTS } from '../types/defaults';
import type { DefaultsView } from '../types/defaults';
import type { SectionBodyProps } from '../types/section';
import { DefaultsForm } from './DefaultsForm';
import { FolderPicker } from './FolderPicker';

/**
 * "Modelos e padrões": the models of the installation, and the defaults a new session starts with —
 * the user's, and the override of the folder in the address, which applies to its subfolders too
 * (plan 13, B-13, B-14, B-16; plan 28, B-36, B-38). A session already running does not change:
 * switching inside one is the panel's selector.
 *
 * Every engine has this section — it is the core's, registered once, for whichever engine's
 * settings are on screen. The one field besides the core's that the engine's own extension adds — an
 * output style, say — comes from `defaultsExtraFields`, the registry its `register.ts` fills (D-06).
 */
export function ModelsSection({
  engine,
  location,
  onLocation,
}: SectionBodyProps): React.JSX.Element {
  const { t } = useTranslation();
  const defaults = useDefaults(engine, location.folder);
  const { view, models } = defaults;
  const extra = defaultsExtraFields.entries().find((field) => field.engine === engine);

  return (
    <div className="flex flex-col gap-4">
      <FolderPicker location={location} onLocation={onLocation} engine={engine} />
      <LoadStatus
        isLoading={defaults.isLoading}
        loadingLabel={t('agentSettings.models.loading')}
        error={defaults.error}
        onRetry={defaults.retry}
        rows={6}
      />
      {/* No list, or an empty one: the selector offers only the installation's default (S-36). */}
      {defaults.noModels && (
        <EmptyState
          title={t('agentSettings.models.noModelsTitle')}
          description={t('agentSettings.models.noModelsBody')}
        />
      )}
      {view !== null && (
        <>
          <DefaultsForm
            key={JSON.stringify(view.user)}
            heading={t('agentSettings.models.forUser')}
            values={view.user}
            effective={location.folder === undefined ? view.effective : null}
            models={models}
            saving={defaults.saving}
            error={defaults.saveError}
            folder={undefined}
            onSave={(values) => {
              defaults.save('user', values);
            }}
            {...(extra === undefined ? {} : { extra })}
          />
          {location.folder !== undefined && (
            <FolderForm folder={location.folder} view={view} defaults={defaults} extra={extra} />
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
  extra,
}: {
  readonly folder: string;
  readonly view: DefaultsView;
  readonly defaults: Defaults;
  readonly extra: DefaultsExtraField | undefined;
}): React.JSX.Element {
  const { t } = useTranslation();
  const stored = view.folder?.values ?? NO_DEFAULTS;

  return (
    <DefaultsForm
      key={`${folder}:${JSON.stringify(stored)}`}
      heading={t('agentSettings.models.forFolder', { folder })}
      values={stored}
      effective={view.effective}
      models={defaults.models}
      saving={defaults.saving}
      error={defaults.saveError}
      folder={folder}
      onSave={(values) => {
        defaults.save('folder', values);
      }}
      {...(extra === undefined ? {} : { extra })}
      {...(view.folder === null ? {} : { onClear: defaults.clearFolder })}
    />
  );
}
