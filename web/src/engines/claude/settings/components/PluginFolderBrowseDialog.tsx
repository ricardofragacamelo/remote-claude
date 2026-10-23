import { useTranslation } from 'react-i18next';

import {
  FolderBrowserPanel,
  FolderPickerDialog,
  FolderPickerFooter,
  useFolderBrowser,
} from '@/features/workspace';

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
 * Built on `FolderPickerDialog`/`FolderBrowserPanel`/`useFolderBrowser` (`@/features/workspace`) —
 * the same shared chrome and lower-level pieces `OpenFolderDialog` (plan 06) is built on — with its
 * own local `onChoose` instead of navigating the workbench. See
 * `docs/plans/13-claude-settings/decisions.md` for why neither `OpenFolderDialog` (a global singleton
 * wired to the workbench) nor `McpFolderPicker`/`FolderSelect` (a dropdown of already-known folders,
 * not a filesystem browse) fit this field, and why the chrome and the browsing UI are shared pieces
 * rather than a second hand-copied implementation of either.
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
        <Browser
          listRef={list}
          onChoose={onChoose}
          onCancel={() => {
            onOpenChange(false);
          }}
        />
      )}
    </FolderPickerDialog>
  );
}

interface BrowserProps {
  readonly listRef: React.RefObject<HTMLDivElement | null>;
  onChoose(path: string): void;
  onCancel(): void;
}

function Browser({ listRef: list, onChoose, onCancel }: BrowserProps): React.JSX.Element {
  const { t } = useTranslation();
  const browser = useFolderBrowser(null);

  return (
    <>
      <FolderBrowserPanel browser={browser} listRef={list} />

      <FolderPickerFooter
        current={browser.current}
        cancelLabel={t('engines.claude.plugins.browseCancel')}
        confirmLabel={t('engines.claude.plugins.browseChoose')}
        onCancel={onCancel}
        onConfirm={onChoose}
      />
    </>
  );
}
