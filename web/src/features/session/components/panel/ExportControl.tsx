import { useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useExportConversation } from '../../hooks/useExportConversation';

/**
 * Exporting the conversation as Markdown (plan 08, B-39): with the outputs of the tools only when
 * asked — off by default, for they can carry a file's contents (D-20, S-181) — and how far the pages
 * have come while it reads them. A failure says so and saves nothing (S-182).
 */
export function ExportControl({
  conversationId,
  folder,
}: {
  readonly conversationId: string | null;
  readonly folder: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const exporting = useExportConversation(conversationId, folder);
  const [outputs, setOutputs] = useState(false);
  const { state } = exporting;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={t('sessions.export.open')}
          disabled={conversationId === null}
        >
          <Download className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="flex w-72 flex-col gap-2 p-2 text-ui-sm">
        <DropdownMenuLabel>{t('sessions.export.open')}</DropdownMenuLabel>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={outputs}
            onChange={(event) => {
              setOutputs(event.target.checked);
            }}
          />
          {t('sessions.export.withOutputs')}
        </label>
        <p className="text-ui-xs text-muted-foreground">{t('sessions.export.outputsWarning')}</p>
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
        {state.kind === 'failed' && (
          <p role="alert" className="text-destructive">
            {t('sessions.export.failed', { reason: t(state.error.messageKey, state.error.params) })}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
