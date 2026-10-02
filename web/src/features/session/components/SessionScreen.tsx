import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import { Panel } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useLiveSession } from '../hooks/useLiveSession';
import { CommandMenu } from './CommandMenu';
import { Conversation } from './Conversation';
import { PromptComposer } from './PromptComposer';
import { SessionControls } from './SessionControls';
import { TurnStatus } from './conversation/TurnStatus';
import { UndoPanel } from './UndoPanel';

export interface SessionScreenProps {
  /** The session in the URL. Pasting the link on another device has to reproduce this screen. */
  readonly sessionId: string;

  /**
   * Opens the whole conversation this session is, on the history screen. The route's to perform:
   * the feature never learns the router exists.
   */
  onOpenHistory?(conversationId: string): void;

  /** What was being written in the prompt box — kept by whoever hosts the screen. */
  readonly draft?: string | undefined;
  readonly onDraftChange?: ((text: string) => void) | undefined;

  /** The real path of the folder of the tab — what names of files of the answer open in. */
  readonly folder?: string | undefined;
}

/**
 * Where the product happens.
 *
 * Four states, and the missing one is always the one a user eventually sees: connecting, live,
 * ended, and ended with nothing left to replay. The last two are **both real** — the second is
 * what happens after every restart of the backend, not a rare edge
 * ([D-10](../../../../../docs/plans/01-live-session/decisions.md)).
 *
 * Since plan 04 there is a fifth thing on it, and it is not a state of the stream: the part of the
 * conversation the ring buffer does not hold — the history before a resume, or everything after a
 * gap. It loads beside the stream, and a failure to load it says so with a way to try again (S-17)
 * without taking away what the stream already showed.
 *
 * And two things beside the prompt box, both closed until asked for: the slash commands of this
 * installation, which write into the box and never stand in its way (B-15), and the undo of what
 * the session wrote to disk, which shows its whole reach before it touches anything (B-19).
 *
 * It imports a hook and nothing else: no service, no `api.ts`.
 */
export function SessionScreen({
  sessionId,
  onOpenHistory,
  draft,
  onDraftChange,
  folder,
}: SessionScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const session = useLiveSession(sessionId);
  const { ending, history } = session;
  const conversationId = history.conversationId;

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

      <TurnStatus
        sessionId={sessionId}
        status={session.status}
        costUsd={session.costUsd}
        turns={session.turns.length}
      />

      <SessionControls
        status={session.status}
        isOwner={session.isOwner}
        onInterrupt={session.interrupt}
        onClose={session.close}
      />

      {history.isLoading && (
        <Skeleton className="h-16 w-full" aria-label={t('session.history.loading')} />
      )}

      {/* What the stream brought stays on screen beside the failure: it is still true. */}
      {history.error !== null && <ErrorState error={history.error} onRetry={history.retry} />}

      {conversationId !== null && onOpenHistory !== undefined && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            onOpenHistory(conversationId);
          }}
        >
          {t('session.history.open')}
        </Button>
      )}

      <Conversation
        conversation={session}
        isPartial={session.isPartial}
        folder={folder ?? ''}
        sessionId={sessionId}
        conversationId={conversationId}
      />

      <UndoPanel sessionId={sessionId} />

      <PromptComposer
        disabled={ending !== null}
        onSubmit={session.prompt}
        error={session.promptError}
        draft={draft}
        onDraftChange={onDraftChange}
        // An ended session has no installation left to ask: the menu goes with it.
        menu={
          ending === null
            ? (insert) => <CommandMenu sessionId={sessionId} onPick={insert} />
            : undefined
        }
      />
    </Panel>
  );
}
