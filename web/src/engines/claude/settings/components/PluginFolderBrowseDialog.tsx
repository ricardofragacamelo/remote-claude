import { FolderChooserBrowser, FolderPickerDialog } from '@/features/workspace';
import type { FolderChooserLabelKeys } from '@/features/workspace';

const LABEL_KEYS: FolderChooserLabelKeys = {
  cancel: 'engines.claude.plugins.browseCancel',
  confirm: 'engines.claude.plugins.browseChoose',
};

export interface PluginFolderBrowseDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;

  /** Called with the folder on screen when "Choose" is pressed — never navigates anywhere itself. */
  onChoose(path: string): void;
}

/**
 * "Choose a folder": browses the allowlist's own roots, one level at a time, for the local-plugin
 * add wizard's path field (plan 13, B-29) — never a path typed loose, the plan's own text.
 *
 * Built on `FolderPickerDialog`/`FolderChooserBrowser` (`@/features/workspace`) — the same shared
 * chrome and browsing pieces `OpenFolderDialog` (plan 06) and the rule-authoring wizard's own
 * `NewRuleFolderDialog` (plan 15, B-27) are built on — with its own local `onChoose` instead of
 * navigating the workbench. See `docs/plans/13-claude-settings/decisions.md` for why neither
 * `OpenFolderDialog` (a global singleton wired to the workbench) nor `McpFolderPicker`/
 * `FolderSelect` (a dropdown of already-known folders, not a filesystem browse) fit this field.
 */
export function PluginFolderBrowseDialog({
  open,
  onOpenChange,
  onChoose,
}: PluginFolderBrowseDialogProps): React.JSX.Element {
  return (
    <FolderPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      titleKey="engines.claude.plugins.browseDialogTitle"
      descriptionKey="engines.claude.plugins.browseDialogDescription"
    >
      {(list) => (
        <FolderChooserBrowser
          listRef={list}
          labelKeys={LABEL_KEYS}
          onChoose={onChoose}
          onCancel={() => {
            onOpenChange(false);
          }}
        />
      )}
    </FolderPickerDialog>
  );
}
