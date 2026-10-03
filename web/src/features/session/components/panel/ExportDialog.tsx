import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { useExportConversation } from '../../hooks/useExportConversation';
import { ActionDialog } from './ActionDialog';

export interface ExportDialogProps {
  readonly open: boolean;
  onClose(): void;
  readonly conversationId: string | null;
  readonly folder: string;
}

/**
 * Exporting the conversation as Markdown (plan 08, B-39), from the menu of the session (plan 09,
 * B-17): with the outputs of the tools only when asked — off by default, for they can carry a file's
 * contents (D-20, S-181) — and how far the pages have come while it reads them. A failure says so
 * and saves nothing (S-182).
 */
export function ExportDialog({
  open,
  onClose,
  conversationId,
  folder,
}: ExportDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const exporting = useExportConversation(conversationId, folder);
  const [outputs, setOutputs] = useState(false);
  const { state } = exporting;

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={t('sessions.export.open')}
      description={t('sessions.export.outputsWarning')}
      closeLabel={t('sessions.export.close')}
      action={
        <Button
          disabled={state.kind === 'loading'}
          onClick={() => {
            exporting.run({ outputs });
          }}
        >
          {state.kind === 'loading'
            ? t('sessions.export.reading', { pages: state.pages })
            : t('sessions.export.save')}
        </Button>
      }
    >
      <label className="flex items-center gap-2 text-ui-sm">
        <input
          type="checkbox"
          checked={outputs}
          onChange={(event) => {
            setOutputs(event.target.checked);
          }}
        />
        {t('sessions.export.withOutputs')}
      </label>
      {state.kind === 'failed' && (
        <p role="alert" className="text-ui-sm text-destructive">
          {t('sessions.export.failed', { reason: t(state.error.messageKey, state.error.params) })}
        </p>
      )}
    </ActionDialog>
  );
}
