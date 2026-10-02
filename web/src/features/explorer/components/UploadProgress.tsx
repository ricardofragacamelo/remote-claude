import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import type { Transfer } from '../hooks/useTransfer';

export interface UploadProgressProps {
  readonly transfer: Transfer;
}

/**
 * An upload on its way (S-318): each file with how far it went, and the way to cancel (S-322) — what
 * the server has written by then stays, whole; nothing is ever left half-written.
 */
export function UploadProgress({ transfer }: UploadProgressProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const upload = transfer.upload;

  if (upload.step !== 'sending') {
    return null;
  }

  return (
    <section
      aria-label={t('explorer.upload.progressLabel')}
      className="flex shrink-0 flex-col gap-1 border-b border-border px-2 py-2 text-ui-sm"
    >
      <div className="flex items-center gap-2">
        <p role="status" className="min-w-0 flex-1 font-ui-strong">
          {t('explorer.upload.sending', { count: upload.files.length })}
        </p>
        <IconButton icon={X} label={t('explorer.upload.cancelSending')} onClick={transfer.cancel} />
      </div>
      <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {upload.files.map(({ path, progress }) => {
          const percent = Math.round(progress * 100);

          return (
            <li key={path} className="flex flex-col gap-0.5">
              <span className="truncate font-code">{path}</span>
              <progress
                className="h-1.5 w-full"
                max={100}
                value={percent}
                aria-label={t('explorer.upload.fileProgress', { path, percent })}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
