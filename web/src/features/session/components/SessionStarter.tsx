import { useTranslation } from 'react-i18next';

import { Panel } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/button';
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
 * without choosing makes a refusal look like a bug.
 */
export function SessionStarter({
  workspacePath,
  onStarted,
}: SessionStarterProps): React.JSX.Element {
  const { t } = useTranslation();
  const { connection, isStarting, start } = useSessionStarter(onStarted);

  return (
    <Panel title={t('session.starter.title')} description={t('session.starter.description')}>
      <p className="text-xs opacity-70">{t(`connection.status.${connection}`)}</p>

      <Button
        size="touch"
        disabled={workspacePath === null || isStarting || connection !== 'ready'}
        onClick={() => {
          if (workspacePath !== null) {
            start(workspacePath);
          }
        }}
      >
        {isStarting ? t('session.starter.pending') : t('session.starter.action')}
      </Button>

      {workspacePath === null && (
        <p className="text-xs opacity-70">{t('session.starter.chooseWorkspace')}</p>
      )}
    </Panel>
  );
}
