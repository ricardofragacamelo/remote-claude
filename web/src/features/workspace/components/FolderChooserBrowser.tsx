import { useTranslation } from 'react-i18next';

import { FolderBrowserPanel } from './FolderBrowserPanel';
import { FolderPickerFooter } from './FolderPickerChrome';
import { useFolderBrowser } from '../hooks/useFolderBrowser';

/** The two i18n keys a "choose a folder" dialog's own footer needs — a caller declares this as a
 * plain module-level constant, never inline in JSX (the same reason `WizardFooterKeys` is one:
 * `pnpm lint:dup` reads two callers whose attributes differ only in which key each names as the
 * same clone). */
export interface FolderChooserLabelKeys {
  readonly cancel: string;
  readonly confirm: string;
}

export interface FolderChooserBrowserProps {
  readonly listRef: React.RefObject<HTMLDivElement | null>;
  readonly labelKeys: FolderChooserLabelKeys;
  onChoose(path: string): void;
  onCancel(): void;
}

/**
 * The body every "choose a folder" dialog built on `FolderPickerDialog` shares: the browser, and
 * its footer — only the chrome around it (the dialog's own title and description) and the two
 * labels differ per caller. Shared by the local-plugin add wizard's own
 * `PluginFolderBrowseDialog` (plan 13, B-29) and the rule-authoring wizard's own
 * `NewRuleFolderDialog` (plan 15, B-27), rather than each hand-copying the same browser and
 * footer under its own local `onChoose`.
 */
export function FolderChooserBrowser({
  listRef,
  labelKeys,
  onChoose,
  onCancel,
}: FolderChooserBrowserProps): React.JSX.Element {
  const { t } = useTranslation();
  const browser = useFolderBrowser(null);

  return (
    <>
      <FolderBrowserPanel browser={browser} listRef={listRef} />

      <FolderPickerFooter
        current={browser.current}
        cancelLabel={t(labelKeys.cancel)}
        confirmLabel={t(labelKeys.confirm)}
        onCancel={onCancel}
        onConfirm={onChoose}
      />
    </>
  );
}
