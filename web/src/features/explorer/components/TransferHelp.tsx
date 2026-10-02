import { useTranslation } from 'react-i18next';

import { formatBytes } from '@/features/editor';
import type { FileLimits } from '../types/transfer';

export interface TransferHelpProps {
  readonly limits: FileLimits | null;
}

/**
 * The part of the Explorer's help about files in and out of the machine (B-53, S-323): how to upload
 * and download, the ceilings **as the server says them** (`GET /files/limits`), and what happens
 * above them — refused before anything moves, never cut half-way.
 */
export function TransferHelp({ limits }: TransferHelpProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const count = new Intl.NumberFormat(i18n.language);

  return (
    <>
      <p>{t('explorer.help.transfer')}</p>
      {limits === null ? (
        <p>{t('explorer.help.transferUnknown')}</p>
      ) : (
        <p>
          {t('explorer.help.transferLimits', {
            uploadFile: formatBytes(limits.uploadMaxBytes, i18n.language),
            uploadEntries: count.format(limits.uploadMaxEntries),
            uploadTotal: formatBytes(limits.uploadMaxTotalBytes, i18n.language),
            download: formatBytes(limits.downloadMaxBytes, i18n.language),
            archiveEntries: count.format(limits.archiveMaxEntries),
          })}
        </p>
      )}
      <p>{t('explorer.help.transferAbove')}</p>
    </>
  );
}
