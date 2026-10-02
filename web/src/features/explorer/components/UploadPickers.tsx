import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { Transfer } from '../hooks/useTransfer';

/**
 * What makes a file input pick a folder — `webkitdirectory`, which every current browser has and the
 * DOM types of React do not name.
 */
const DIRECTORY_PICKER: Readonly<Record<string, string>> = { webkitdirectory: '' };

export interface UploadPickersProps {
  readonly transfer: Transfer;
}

/**
 * The browser's own dialogs of files and of a folder — hidden inputs that "Upload files here…" and
 * "Upload folder here…" open: the way to upload with the keyboard only (S-360). The folder's is the
 * directory picker every current browser has (`webkitdirectory`), and keeps the folder's structure.
 */
export function UploadPickers({ transfer }: UploadPickersProps): React.JSX.Element {
  const { t } = useTranslation();
  const { filesInput, folderInput, picked: take } = transfer.pickers;
  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    take(event.currentTarget.files);
    // The same file picked twice is a second upload, and only a cleared input says it changed.
    event.currentTarget.value = '';
  };

  return (
    <>
      <input
        ref={filesInput}
        type="file"
        multiple
        hidden
        aria-label={t('explorer.action.uploadFiles')}
        onChange={picked}
      />
      <input
        ref={folderInput}
        {...DIRECTORY_PICKER}
        type="file"
        hidden
        aria-label={t('explorer.action.uploadFolder')}
        onChange={picked}
      />
    </>
  );
}
