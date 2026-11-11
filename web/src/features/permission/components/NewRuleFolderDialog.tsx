import { FolderChooserBrowser, FolderPickerDialog } from '@/features/workspace';
import type { FolderChooserLabelKeys } from '@/features/workspace';

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
