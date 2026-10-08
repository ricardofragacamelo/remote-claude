import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import type { PermissionRequest, PlanMode } from '@/features/permission';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';

import { useComposerSend } from '../hooks/useComposerSend';
import { useSessionSettings } from '../hooks/useSessionSettings';
import type { SessionSettings } from '../hooks/useSessionSettings';
import type { SessionComposer } from '../hooks/useComposerSend';
import type { EditAndResend } from '../hooks/useEditAndResend';
import { useInlineRequests } from '../hooks/useInlineRequests';
import type { InlineRequests } from '../hooks/useInlineRequests';
import { useLiveSession } from '../hooks/useLiveSession';
import { useRequestsInView } from '../hooks/useRequestsInView';
import type { RequestsInView } from '../hooks/useRequestsInView';
import { usePanelDraft } from '../hooks/usePanelTabs';
import { useResumeAndSend } from '../hooks/useResumeAndSend';
import type { ResumeAndSend } from '../hooks/useResumeAndSend';
import { useScrollKeeper } from '../hooks/useScrollKeeper';
import { taskListOf } from '../lib/task-list';
import { isTurnRunning } from '../lib/turn';
import { tabKeyOf } from '../store/claude-panel.store';
import type { LiveSession } from '../hooks/useLiveSession';
import type { ToolExecution } from '../types/live-session';
import { EditBanner } from './panel/EditBanner';
import { PendingPill } from './panel/PendingPill';
import { QueueList } from './panel/QueueList';
import { UndoDialog } from './panel/UndoDialog';
import { ChatComposer } from './composer/ChatComposer';
import type { ChatComposerProps } from './composer/ChatComposer';
import { ContextDropZone } from './composer/ContextDropZone';
import { sessionBarOf } from './composer/SessionBar';
import { TaskStrip } from './composer/TaskStrip';
import { TailRequests } from './conversation/InlinePermission';
import type { InlineContext, PromptActions } from './conversation/timeline-context';
import { WorkingIndicator } from './conversation/WorkingIndicator';
import { Conversation } from './Conversation';
import { ChatFrame } from './frame/ChatFrame';
import { StateStrip } from './frame/StateStrip';

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

  /**
   * What stands in for the conversation — the changes of the session (plan 09, S-08). Only the
   * middle changes: the box, what is written in it and its context stay.
   */
  readonly changes?: ReactNode;

  /** Where the rules a "don't ask again" left are taken back — the host's to open. */
  onOpenRules?: (() => void) | undefined;

  /** A plan was approved, to go on in this mode — the chip of the bar follows (plan 09, B-24). */
  onPlanApproved?: ((mode: PlanMode) => void) | undefined;

  /** Puts the conversation back in the middle — where the pill takes a question out of view. */
  onShowChat?: (() => void) | undefined;
}

/**
 * Where the product happens — in the frame of the panel (plan 09, B-05, B-06): the conversation in
 * the middle, the box at the bottom, with what runs the next turn in its bar (B-09). No card around
 * it and no header of its own: the session **is** the conversation, its id is what the frame is
 * called, and what is done to the whole session — end it, export it, undo — is the panel's menu
 * (B-17).
 *
 * Four states, and the missing one is always the one a user eventually sees: connecting, live,
 * ended, and ended with nothing left to replay. The last two are **both real** — the second is
 * what happens after every restart of the backend, not a rare edge
 * ([D-10](../../../../../docs/plans/01-live-session/decisions.md)). Each is a strip of one line:
 * the connection at the top of the conversation, the end of the session above the box — whose
 * prompt, sent, resumes it (D-05).
 *
 * Since plan 04 there is a fifth thing on it, and it is not a state of the stream: the part of the
 * conversation the ring buffer does not hold — the history before a resume, or everything after a
 * gap. It loads beside the stream, and a failure to load it says so with a way to try again (S-17)
 * without taking away what the stream already showed.
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
  changes,
  onOpenRules,
  onPlanApproved,
  onShowChat,
}: SessionScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const session = useLiveSession(sessionId);
  const key = tabKeyOf('session', sessionId);
  const composer = useComposerSend(folder, key, sessionId);
  const resume = useResumeAndSend(folder, sessionId, session.history.conversationId);
  const keeper = useScrollKeeper(folder, changes === undefined ? key : null);
  // What is being written is the tab's, kept by the panel — given back there after a refusal.
  const written = usePanelDraft(folder, key);
  const requests = useInlineRequests(sessionId);
  const anchor = useRef<HTMLDivElement>(null);
  const finder = useRequestsInView(
    anchor,
    requests.pending.map((request) => request.requestId),
    onShowChat,
  );
  const taskList = useMemo(() => taskListOf(session.tools), [session.tools]);
  const [undoAt, setUndoAt] = useState<string | null>(null);
  const inline: InlineContext = { requests, folder, onOpenRules, onPlanApproved };

  return (
    <ContextDropZone folder={folder} context={composer.context} fill>
      <ChatFrame
        label={t('session.screen.sessionLabel', { sessionId })}
        keeper={keeper}
        dock={
          <>
            <div ref={anchor} className="contents">
              <PendingPill
                count={requests.pending.length}
                outOfView={finder.outOfView}
                questionsOnly={onlyQuestions(requests.pending)}
                onGoTo={finder.goToOldest}
              />
            </div>
            <AnswerRefusal requests={requests} />
            <EndedStrip session={session} resume={resume} />
            <QueueList sessionId={sessionId} />
            <TaskStrip list={taskList} />
            {edit !== undefined && <EditArea edit={edit} />}
            <Composer
              session={session}
              composer={composer}
              resume={resume}
              folder={folder}
              edit={edit}
              draft={draft ?? written.text}
              onDraftChange={onDraftChange ?? written.setText}
            />
          </>
        }
      >
        {changes ?? (
          <>
            <ConnectionStrip session={session} />
            <HistoryState history={session.history} onOpenHistory={onOpenHistory} />
            <Conversation
              conversation={session}
              isPartial={session.isPartial}
              folder={folder}
              sessionId={sessionId}
              conversationId={session.history.conversationId}
              prompts={promptActionsOf(session, edit, setUndoAt, t)}
              inline={inline}
            />
            <TailRequests inline={inline} drawn={drawnTools(session.tools)} />
            <Working session={session} requests={requests} finder={finder} />
          </>
        )}
      </ChatFrame>
      <UndoDialog
        sessionId={sessionId}
        open={undoAt !== null}
        prompt={undoAt}
        onClose={() => {
          setUndoAt(null);
        }}
      />
    </ContextDropZone>
  );
}

/** The tools that are lines of the main conversation — where a card can stand in for its line. */
function drawnTools(tools: readonly ToolExecution[]): ReadonlySet<string> {
  return new Set(
    tools.filter((tool) => tool.parentToolUseId === null).map((tool) => tool.toolUseId),
  );
}

/**
 * What can be done from a prompt (plan 09, B-27): edit and fork, as the panel edits — and, while the
 * session lives, put its files back to before that turn, refused with the reason while a turn runs.
 */
function promptActionsOf(
  session: LiveSession,
  edit: EditAndResend | undefined,
  undoAt: (prompt: string) => void,
  t: TFunction,
): PromptActions {
  return {
    onEdit: edit?.begin,
    onFork: edit?.forkFrom,
    onUndo:
      session.ending === null
        ? (message) => {
            undoAt(message.text);
          }
        : undefined,
    undoBlocked: isTurnRunning(session.status) ? t('sessions.message.undoBusy') : null,
  };
}

/**
 * The last line of the conversation while the turn runs (plan 09, B-21): what Claude does, the tool
 * of the main conversation it runs, and — with a question open — the way to it.
 */
function Working({
  session,
  requests,
  finder,
}: {
  readonly session: LiveSession;
  readonly requests: InlineRequests;
  readonly finder: RequestsInView;
}): React.JSX.Element {
  const running = session.tools.findLast(
    (tool) => tool.status === 'running' && tool.parentToolUseId === null,
  );

  return (
    <WorkingIndicator
      status={session.status}
      turnSince={session.turnSince}
      turn={`${session.sessionId ?? ''}:${String(session.turns.length)}`}
      tool={running?.toolName ?? null}
      waiting={requests.pending.length}
      questionsOnly={onlyQuestions(requests.pending)}
      onGoToRequest={finder.goToOldest}
    />
  );
}

/** Why the last answer to a question was refused — it came after the deadline (plan 09, S-61). */
function AnswerRefusal({
  requests,
}: {
  readonly requests: InlineRequests;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const { refusal } = requests;

  return refusal === null ? null : (
    <StateStrip role="alert">{t(refusal.messageKey, refusal.params)}</StateStrip>
  );
}

/** The connection, when it is not up — pinned at the top, gone without moving the box (S-10). */
function ConnectionStrip({ session }: { readonly session: LiveSession }): React.JSX.Element | null {
  const { t } = useTranslation();

  return session.connection === 'ready' ? null : (
    <StateStrip pinned>{t(`connection.status.${session.connection}`)}</StateStrip>
  );
}

/**
 * The end of the session, above the box: why it ended and — when the conversation it was is known —
 * that sending resumes it, in a subprocess of its own (D-05). A resume refused says why here, with
 * the text and the context still in the box (S-89).
 */
function EndedStrip({
  session,
  resume,
}: {
  readonly session: LiveSession;
  readonly resume: ResumeAndSend;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const { ending } = session;

  if (ending === null) {
    return null;
  }

  return (
    <>
      <StateStrip>
        {t('session.screen.ended', {
          reason: t(`session.closeReason.${ending.reason}`),
          at: ending.at,
        })}{' '}
        {resume.canResume && t('session.ended.resumes')}
      </StateStrip>
      {resume.error !== null && (
        <StateStrip role="alert">{t(resume.error.messageKey, resume.error.params)}</StateStrip>
      )}
    </>
  );
}

/**
 * The part of the conversation the buffer does not hold, at the top of it: loading, failed with the
 * way to try again, and the way to all of it.
 */
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
        <Skeleton className="h-6 w-full" aria-label={t('session.history.loading')} />
      )}

      {/* What the stream brought stays on screen beside the failure: it is still true. */}
      {history.error !== null && (
        <StateStrip
          role="alert"
          action={
            <Button variant="outline" onClick={history.retry}>
              {t('common.action.retry')}
            </Button>
          }
        >
          {t(history.error.messageKey, history.error.params)}{' '}
          <span className="font-mono text-muted-foreground">
            {t('common.error.traceLabel', { traceId: history.error.traceId })}
          </span>
        </StateStrip>
      )}

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
        <StateStrip
          role="alert"
          action={
            edit.canResumeInstead && (
              <Button variant="outline" onClick={edit.resumeInstead}>
                {t('sessions.edit.resumeInstead')}
              </Button>
            )
          }
        >
          {t(edit.error.messageKey, edit.error.params)}
        </StateStrip>
      )}
    </>
  );
}

interface ComposerProps {
  readonly session: LiveSession;
  readonly composer: SessionComposer;
  readonly resume: ResumeAndSend;
  readonly folder: string;
  readonly edit: EditAndResend | undefined;
  readonly draft: string;
  onDraftChange(text: string): void;
}

/**
 * The prompt box of the session: a prompt with its context, or — while one is edited — the edited
 * prompt, sent as a fork, alone. Stop, and `Esc` in it, interrupt the turn running, once (S-183,
 * S-184, plan 09, S-19); while a prompt is edited, `Esc` stops editing first (S-32). In a session
 * that ended, the prompt resumes it first (D-05), and there is nothing to stop (S-22).
 */
function Composer(props: ComposerProps): React.JSX.Element {
  const { session, edit, folder } = props;
  const { t } = useTranslation();
  const { shared, refusal, stop } = useSessionComposer(props);
  const editing = editingIn(edit);

  if (editing !== null) {
    return (
      <ChatComposer
        {...shared}
        key={editing.messageId}
        disabled={session.ending !== null || edit?.isSending === true}
        onSubmit={editing.send}
        error={session.promptError ?? refusal}
        draft={editing.original}
        onEscape={editing.cancel}
        submitLabel={t('sessions.edit.send')}
      />
    );
  }

  return (
    <ChatComposer
      {...shared}
      {...sendingOf(props, t)}
      key={`prompt-${String(props.composer.refusals)}-${String(props.resume.refusals)}`}
      error={props.composer.error ?? session.promptError ?? refusal}
      draft={props.draft}
      onDraftChange={props.onDraftChange}
      onEscape={stop}
      context={folder === '' ? undefined : props.composer.context}
      sessionId={session.sessionId}
    />
  );
}

/**
 * What the box of the session is, prompt or edit alike: its folder, whether a turn runs — and the way
 * to stop it —, and its bar, while the session runs. An ended session has nothing to choose: sending
 * resumes it (D-05).
 */
function useSessionComposer({ session, folder }: ComposerProps): {
  readonly shared: Pick<ChatComposerProps, 'folder' | 'queued' | 'onStop' | 'bar'>;
  readonly refusal: SessionSettings['refusal'];
  stop(): void;
} {
  const { t } = useTranslation();
  const stop = useInterruptOnce(session);
  const sessionId = session.sessionId ?? '';
  const live = session.ending === null;
  const settings = useSessionSettings(folder, sessionId, live);
  const running = isTurnRunning(session.status);
  const compact = (): void => {
    session.prompt('/compact');
  };

  return {
    shared: {
      folder,
      queued: running,
      onStop: running ? stop : undefined,
      bar: live ? sessionBarOf(sessionId, settings, compact, t) : undefined,
    },
    refusal: settings.refusal,
    stop,
  };
}

/**
 * Where the prompt goes: to the session, or — with the session ended — to the resume of it, which
 * the button says (D-05). Nothing goes while the resume is on its way, or when there is nothing to
 * resume.
 */
function sendingOf(
  { session, composer, resume, edit }: ComposerProps,
  t: TFunction,
): Pick<ChatComposerProps, 'disabled' | 'onSubmit' | 'submitLabel'> {
  if (session.ending === null) {
    return { disabled: edit?.isSending === true, onSubmit: composer.send };
  }

  return {
    disabled: !resume.canResume || resume.isResuming,
    onSubmit: resume.send,
    ...(resume.canResume ? { submitLabel: t('session.ended.resumeAndSend') } : {}),
  };
}

/** The prompt being edited, and the ways to send it or to stop — `null` when none is. */
function editingIn(edit: EditAndResend | undefined): {
  readonly messageId: string;
  readonly original: string;
  send(text: string): void;
  cancel(): void;
} | null {
  const editing = edit?.editing ?? null;

  return edit === undefined || editing === null
    ? null
    : {
        messageId: editing.messageId,
        original: editing.original,
        send: edit.send,
        cancel: edit.cancel,
      };
}

/**
 * Stop, or `Esc`, with a turn running interrupts it — once per turn, however often either is
 * pressed (S-184, plan 09, S-19).
 */
function useInterruptOnce(session: LiveSession): () => void {
  const interruptedIn = useRef<number | null>(null);

  return () => {
    if (isTurnRunning(session.status) && interruptedIn.current !== session.turns.length) {
      interruptedIn.current = session.turns.length;
      session.interrupt();
    }
  };
}

/** Whether everything waiting on the person is a question of Claude — none a permission. */
function onlyQuestions(pending: readonly PermissionRequest[]): boolean {
  return pending.length > 0 && pending.every((request) => request.interaction !== null);
}
