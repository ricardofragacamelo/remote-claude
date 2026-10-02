import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import { Panel } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';

import type { EditAndResend } from '../hooks/useEditAndResend';
import { useLiveSession } from '../hooks/useLiveSession';
import type { LiveSession } from '../hooks/useLiveSession';
import type { SessionStatus } from '../types/live-session';
import { EditBanner } from './panel/EditBanner';
import { QueueList } from './panel/QueueList';
import { SessionHeader } from './panel/SessionHeader';
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

  /** Editing a prompt to send it again — the panel's, so it outlives a switch of tab (B-35). */
  readonly edit?: EditAndResend | undefined;
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
  folder = '',
  edit,
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

      {ending === null && (
        <SessionHeader
          folder={folder}
          sessionId={sessionId}
          conversationId={conversationId}
          onCompact={() => {
            session.prompt('/compact');
          }}
        />
      )}

      <HistoryState history={history} onOpenHistory={onOpenHistory} />

      <Conversation
        conversation={session}
        isPartial={session.isPartial}
        folder={folder}
        sessionId={sessionId}
        conversationId={conversationId}
        onEditPrompt={edit?.begin}
        onForkFrom={edit?.forkFrom}
      />

      <UndoPanel sessionId={sessionId} />

      <QueueList sessionId={sessionId} />

      {edit !== undefined && <EditArea edit={edit} />}

      <Composer session={session} edit={edit} draft={draft} onDraftChange={onDraftChange} />
    </Panel>
  );
}

/** The part of the conversation the buffer does not hold: loading, failed, and the way to all of it. */
function HistoryState({
  history,
  onOpenHistory,
}: {
  readonly history: LiveSession['history'];
  readonly onOpenHistory: SessionScreenProps['onOpenHistory'];
}): React.JSX.Element {
  const { t } = useTranslation();
  const conversationId = history.conversationId;

  return (
    <>
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
    </>
  );
}

/** What editing a prompt says, and why the fork was refused — with the plain resume offered. */
function EditArea({ edit }: { readonly edit: EditAndResend }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <EditBanner edit={edit} />
      {edit.error !== null && (
        <div className="flex flex-col gap-2">
          <ErrorState error={edit.error} />
          {edit.canResumeInstead && (
            <Button variant="outline" className="self-start" onClick={edit.resumeInstead}>
              {t('sessions.edit.resumeInstead')}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** The states in which a turn is running — what `Esc` interrupts (plan 08, B-40). */
const RUNNING: ReadonlySet<SessionStatus> = new Set(['thinking', 'running', 'waitingPermission']);

interface ComposerProps {
  readonly session: LiveSession;
  readonly edit: EditAndResend | undefined;
  readonly draft: string | undefined;
  readonly onDraftChange: ((text: string) => void) | undefined;
}

/**
 * The prompt box of the session: a prompt, or — while one is edited — the edited prompt, sent as a
 * fork. `Esc` in it interrupts the turn running, once (S-183, S-184).
 */
function Composer({ session, edit, draft, onDraftChange }: ComposerProps): React.JSX.Element {
  const { t } = useTranslation();
  const escape = useInterruptOnce(session);
  const editing = editingIn(edit);

  return (
    <PromptComposer
      key={editing?.messageId ?? 'prompt'}
      disabled={isLocked(session, edit)}
      onSubmit={editing?.send ?? session.prompt}
      error={session.promptError}
      draft={editing?.original ?? draft}
      onDraftChange={editing === null ? onDraftChange : undefined}
      onEscape={escape}
      submitLabel={editing === null ? undefined : t('sessions.edit.send')}
      menu={menuOf(session)}
    />
  );
}

/** Whether the box takes nothing now: the session ended, or an edited prompt is on its way. */
function isLocked(session: LiveSession, edit: EditAndResend | undefined): boolean {
  return session.ending !== null || edit?.isSending === true;
}

/** The prompt being edited, and the way to send it — `null` when none is. */
function editingIn(
  edit: EditAndResend | undefined,
): { readonly messageId: string; readonly original: string; send(text: string): void } | null {
  const editing = edit?.editing ?? null;

  return edit === undefined || editing === null
    ? null
    : { messageId: editing.messageId, original: editing.original, send: edit.send };
}

/** `Esc` with a turn running interrupts it — once per turn, however often it is pressed (S-184). */
function useInterruptOnce(session: LiveSession): () => void {
  const interruptedIn = useRef<number | null>(null);

  return () => {
    if (RUNNING.has(session.status) && interruptedIn.current !== session.turns.length) {
      interruptedIn.current = session.turns.length;
      session.interrupt();
    }
  };
}

/** The slash commands of the installation — gone with an ended session, which has none to ask. */
function menuOf(session: LiveSession): React.ComponentProps<typeof PromptComposer>['menu'] {
  const sessionId = session.sessionId;

  return session.ending === null && sessionId !== null
    ? (insert) => <CommandMenu sessionId={sessionId} onPick={insert} />
    : undefined;
}
