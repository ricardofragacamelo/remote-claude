import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { OperationRunner } from '../hooks/useOutcome';
import { ExplorerDialog, PathList } from './ExplorerDialog';

export interface SensitiveDialogProps {
  readonly runner: OperationRunner;
}

/**
 * The second step of a path that changes what Claude may do — `.claude/settings.json`, `.mcp.json` —
 * said before anything is sent: "this changes what Claude can do without asking" (07 · D-15). The way
 * out takes the focus.
 */
export function SensitiveDialog({ runner }: SensitiveDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const answers = (
    <>
      <Button variant="outline" onClick={runner.cancelSensitive}>
        {t('explorer.sensitive.cancel')}
      </Button>
      <Button
        variant="destructive"
        onClick={() => {
          void runner.confirmSensitive();
        }}
      >
        {t('explorer.sensitive.confirm')}
      </Button>
    </>
  );

  return (
    <ExplorerDialog
      title={t('explorer.sensitive.title')}
      description={t('explorer.sensitive.description')}
      footer={answers}
      open={runner.sensitive !== null}
      onClose={runner.cancelSensitive}
    >
      <PathList label={t('explorer.sensitive.listLabel')} paths={runner.sensitive?.paths ?? []} />
    </ExplorerDialog>
  );
}
