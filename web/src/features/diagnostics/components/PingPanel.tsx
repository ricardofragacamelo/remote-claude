import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import { Panel } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/button';
import { useConnection } from '../hooks/useConnection';
import { usePing } from '../hooks/usePing';
import { PingRow } from './PingRow';

/**
 * The end-to-end round trip: one command across every layer and back as an event, with how long it
 * took.
 *
 * Each ping is a row of its own, answered by the pong that carries its nonce — never by the next one
 * to arrive (plan 06, S-141). A ping asked for while the socket is down says so, translated, with the
 * way to reconnect beside it (S-140). The four states of a screen that loads data are all here: the
 * empty one teaches the next step, the error says what to do.
 *
 * It imports hooks, and nothing else: no service, no `api.ts`, no socket.
 */
export function PingPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const { sessionId, requests, isSending, error, ping } = usePing();
  const connection = useConnection();

  return (
    <Panel title={t('diagnostics.ping.title')} description={t('diagnostics.ping.description')}>
      <Button size="touch" onClick={ping} disabled={isSending} aria-busy={isSending}>
        {t('diagnostics.ping.action')}
      </Button>

      {error !== null && (
        <ErrorState
          error={error}
          {...(connection.canReconnect ? { onRetry: connection.reconnect } : {})}
          retryLabel={t('diagnostics.connection.reconnect')}
        />
      )}

      {requests.length === 0 ? (
        <EmptyState
          title={t('diagnostics.ping.emptyTitle')}
          description={t('diagnostics.ping.empty')}
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t('diagnostics.ping.listLabel')}>
          {requests.map((request) => (
            <PingRow key={request.nonce} request={request} />
          ))}
        </ul>
      )}

      {sessionId !== null && (
        <p className="font-code text-ui-sm text-muted-foreground">
          {t('diagnostics.ping.sessionLabel', { sessionId })}
        </p>
      )}
    </Panel>
  );
}
