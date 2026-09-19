import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { Panel } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useSessionStream } from '../hooks/useSessionStream';

/**
 * The screen of the walking skeleton.
 *
 * It handles the four states every screen that loads data has to handle — loading, error, empty and
 * content. A missing one is a review failure, because the missing one is always the one a user
 * eventually sees. See docs/architecture/web/03-ui-system.md.
 *
 * It imports a hook, and nothing else: no service, no `api.ts`, no socket.
 */
export function SessionPingPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const { status, sessionId, pongs, isSending, ping } = useSessionStream();

  return (
    <Panel title={t('session.ping.title')} description={t('session.ping.description')}>
      <p className="text-xs text-muted-foreground" data-testid="connection-status">
        {t(`connection.status.${status}`)}
      </p>

      <Button
        size="touch"
        onClick={ping}
        disabled={status !== 'ready' || isSending}
        aria-busy={isSending}
      >
        {t('session.ping.action')}
      </Button>

      {isSending && <Skeleton className="h-16 w-full" aria-label={t('session.ping.pending')} />}

      {!isSending && pongs.length === 0 && (
        <EmptyState title={t('session.ping.title')} description={t('session.ping.empty')} />
      )}

      {pongs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {pongs.map((pong) => (
            <li key={pong.seq} className="rounded-lg border border-border p-3 text-sm">
              <p>{t('session.ping.result', { count: pong.pingCount, at: pong.pingedAt })}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {t('session.ping.sequence', { seq: pong.seq })}
              </p>
            </li>
          ))}
        </ul>
      )}

      {sessionId !== null && (
        <p className="font-mono text-xs text-muted-foreground">
          {t('session.ping.sessionLabel', { sessionId })}
        </p>
      )}
    </Panel>
  );
}
