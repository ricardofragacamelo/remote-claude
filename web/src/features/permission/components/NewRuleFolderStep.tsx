import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FolderChoiceButton, NewRuleFolderDialog } from './NewRuleFolderDialog';
import { RuleWizardOption } from './RuleWizardOption';
import type { PersistedScope } from '../types/permission';

const OPTION_CLASS = 'flex min-h-touch items-center rounded-md border px-3 text-ui-sm';

export interface NewRuleFolderStepProps {
  readonly scope: PersistedScope | null;
  readonly folder: string | null;
  onChange(patch: { scope?: PersistedScope; folder?: string | null }): void;
}

/**
 * Step 4: everywhere, or one folder — chosen only by the seletor (plan 06), never typed (S-187).
 * `project` reaches that folder and its subfolders, per D-10's own revision — the step says so,
 * never the older "only this folder" text the plan's first draft had.
 */
export function NewRuleFolderStep({
  scope,
  folder,
  onChange,
}: NewRuleFolderStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label={t('rules.wizard.folderStepLabel')}
      >
        <RuleWizardOption
          className={OPTION_CLASS}
          pressed={scope === 'always'}
          onClick={() => {
            onChange({ scope: 'always', folder: null });
          }}
        >
          {t('rules.scope.always')}
        </RuleWizardOption>
        <RuleWizardOption
          className={OPTION_CLASS}
          pressed={scope === 'project'}
          onClick={() => {
            onChange({ scope: 'project' });
          }}
        >
          {t('rules.scope.project')}
        </RuleWizardOption>
      </div>

      {scope === 'always' && (
        <p className="text-ui-sm text-muted-foreground">{t('rules.wizard.folderAlwaysBody')}</p>
      )}

      {scope === 'project' && (
        <div className="flex flex-col gap-2">
          <p className="text-ui-sm text-muted-foreground">{t('rules.wizard.folderProjectBody')}</p>
          <FolderChoiceButton
            folder={folder}
            onOpen={() => {
              setPickerOpen(true);
            }}
          />
        </div>
      )}

      <NewRuleFolderDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onChoose={(path) => {
          onChange({ folder: path });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
