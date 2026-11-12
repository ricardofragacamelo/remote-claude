import { useTranslation } from 'react-i18next';

import { FolderChooserBrowser, FolderPickerDialog } from '@/features/workspace';
import type { FolderChooserLabelKeys } from '@/features/workspace';
import { Button } from '@/shared/components/ui/button';

const LABEL_KEYS: FolderChooserLabelKeys = {
  cancel: 'rules.wizard.folderCancel',
  confirm: 'rules.wizard.folderChoose',
};

export interface NewRuleFolderDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;

  /** The folder on screen when "Choose" is pressed — never a path typed loose (S-187: there is no
   * text field for it, only the seletor). */
  onChoose(path: string): void;
}

/**
 * "Choose a folder" for the rule-authoring wizard's own folder step (plan 15, B-27, S-187) — the
 * same chrome and browsing pieces (`FolderPickerDialog`/`FolderChooserBrowser`,
 * `@/features/workspace`) `OpenFolderDialog` (plan 06) and the local-plugin add wizard's own
 * `PluginFolderBrowseDialog` (plan 13, B-29) already share, with this step's own `onChoose` instead
 * of opening a workbench tab — the seletor only ever walks the allowlist's own roots.
 */
export function NewRuleFolderDialog({
  open,
  onOpenChange,
  onChoose,
}: NewRuleFolderDialogProps): React.JSX.Element {
  return (
    <FolderPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      titleKey="rules.wizard.folderDialogTitle"
      descriptionKey="rules.wizard.folderDialogDescription"
    >
      {(list) => (
        <FolderChooserBrowser
          listRef={list}
          onCancel={() => {
            onOpenChange(false);
          }}
          onChoose={onChoose}
          labelKeys={LABEL_KEYS}
        />
      )}
    </FolderPickerDialog>
  );
}

/**
 * "Choose a folder…", or "Change the folder…" once one is picked, beside the folder itself once
 * it is — the one button every step that reaches for `NewRuleFolderDialog` shows the same way
 * (the wizard's own folder step, the template review's own, B-30).
 */
export function FolderChoiceButton({
  folder,
  onOpen,
}: {
  readonly folder: string | null;
  onOpen(): void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" onClick={onOpen}>
        {folder === null ? t('rules.wizard.folderChoose') : t('rules.wizard.folderChangeChoice')}
      </Button>
      {folder !== null && <code className="text-ui-sm">{folder}</code>}
    </div>
  );
}
