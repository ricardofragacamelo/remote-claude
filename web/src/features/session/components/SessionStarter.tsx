import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { ErrorState } from '@/shared/components/ErrorState';
import { Panel } from '@/shared/components/Panel';
import { useSessionStarter } from '../hooks/useSessionStarter';

export interface SessionStarterProps {
  /**
   * The folder the session is born in — the workbench's, as the server resolved it. There is no
   * "none yet": the starter is shown only once a folder is, so a session can never fall back to the
   * first root (plan 06, B-16).
   */
  readonly workspacePath: string;

  /** Called with the id the **server** minted, once it has. */
  onStarted(sessionId: string): void;
}

/**
 * Opening a session on the folder of the workbench.
 *
 * A refusal the backend gives — the machine already running as many sessions as it allows — is
 * shown here, translated, with the trace, and the button is free again for when a slot is
 * (plan 05, S-41).
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
        disabled={isStarting || connection !== 'ready'}
        onClick={() => {
          start(workspacePath);
        }}
      >
        {isStarting ? t('session.starter.pending') : t('session.starter.action')}
      </Button>

      {error !== null && <ErrorState error={error} />}
    </Panel>
  );
}
