import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { ErrorState } from '@/shared/components/ErrorState';
import { Panel } from '@/shared/components/Panel';
import { useSessionStarter } from '../hooks/useSessionStarter';

export interface SessionStarterProps {
  /** The workspace chosen above, or `null` while none is. */
  readonly workspacePath: string | null;

  /** Called with the id the **server** minted, once it has. */
  onStarted(sessionId: string): void;
}

/**
 * Opening a session on the chosen workspace.
 *
 * It cannot open one without a workspace, and it says so rather than failing at the backend: the
 * allowlist is the first line of defence of the product, and a screen that lets somebody try
 * without choosing makes a refusal look like a bug. A refusal the backend **does** give — the
 * machine already running as many sessions as it allows — is shown here, translated, with the
 * trace, and the button is free again for when a slot is (plan 05, S-41).
 */
export function SessionStarter({
  workspacePath,
  onStarted,
}: SessionStarterProps): React.JSX.Element {
  const { t } = useTranslation();
  const { connection, isStarting, error, start } = useSessionStarter(onStarted);

  return (
    <Panel title={t('session.starter.title')} description={t('session.starter.description')}>
      <p className="text-xs opacity-70">{t(`connection.status.${connection}`)}</p>

      <Button
        size="touch"
        disabled={workspacePath === null || isStarting || connection !== 'ready'}
        // No handler at all without a workspace: the button is disabled then, and a click that
        // could never arrive needs no branch to ignore it.
        onClick={
          workspacePath === null
            ? undefined
            : () => {
                start(workspacePath);
              }
        }
      >
        {isStarting ? t('session.starter.pending') : t('session.starter.action')}
      </Button>

      {workspacePath === null && (
        <p className="text-xs opacity-70">{t('session.starter.chooseWorkspace')}</p>
      )}

      {error !== null && <ErrorState error={error} />}
    </Panel>
  );
}
