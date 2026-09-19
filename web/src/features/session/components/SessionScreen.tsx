import { useTranslation } from 'react-i18next';

import { Panel } from '@/shared/components/Panel';
import { useLiveSession } from '../hooks/useLiveSession';
import { Conversation } from './Conversation';
import { PromptComposer } from './PromptComposer';
import { SessionControls } from './SessionControls';

export interface SessionScreenProps {
  /** The session in the URL. Pasting the link on another device has to reproduce this screen. */
  readonly sessionId: string;
}

/**
 * Where the product happens.
 *
 * Four states, and the missing one is always the one a user eventually sees: connecting, live,
 * ended, and ended with nothing left to replay. The last two are **both real** — the second is
 * what happens after every restart of the backend, not a rare edge
 * ([D-10](../../../../../docs/plans/01-live-session/decisions.md)).
 *
 * It imports a hook and nothing else: no service, no `api.ts`.
 */
export function SessionScreen({ sessionId }: SessionScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const session = useLiveSession(sessionId);
  const { ending } = session;

  return (
    <Panel
      title={t('session.screen.title')}
      description={t('session.screen.sessionLabel', { sessionId })}
    >
      <p className="text-xs opacity-70">{t(`connection.status.${session.connection}`)}</p>

      {ending !== null && (
        <p className="rounded bg-muted p-2 text-xs" role="status">
          {t('session.screen.ended', {
            reason: t(`session.closeReason.${ending.reason}`),
            at: ending.at,
          })}
        </p>
      )}

      <SessionControls
        status={session.status}
        isOwner={session.isOwner}
        onInterrupt={session.interrupt}
        onClose={session.close}
      />

      <Conversation
        messages={session.messages}
        tools={session.tools}
        isPartial={session.isPartial}
      />

      {session.lastTurn !== null && (
        <p className="text-xs opacity-70">
          {t('session.screen.turn', {
            cost: session.lastTurn.costUsd,
            ms: session.lastTurn.durationMs,
          })}
        </p>
      )}

      <PromptComposer disabled={ending !== null} onSubmit={session.prompt} />
    </Panel>
  );
}
