import { Smartphone, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import { ago, agoFrom } from '@/shared/lib/relative-time';
import { cn } from '@/shared/lib/utils';
import { refusalFor } from '../../hooks/useSessionsView';
import type { SessionsView } from '../../hooks/useSessionsView';
import type { ConversationSummary } from '../../types/history';
import type { LiveSessionSummary } from '../../types/sessions-view';
import { rowAction, RowActions } from './RowActions';
import type { RowAction } from './RowActions';

/** Where a session ran, relative to the folder of the tab — `null` when it is the folder itself. */
export function subfolderOf(folder: string, path: string): string | null {
  return path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : null;
}

/**
 * A row with its actions: the button that is the row — its title first — opens it with the first
 * action, and the menu beside it offers every action, the same ones the palette runs on the row
 * selected (S-47).
 */
function ActionRow({
  view,
  id,
  title,
  labelKey,
  actions,
  children,
}: {
  readonly view: SessionsView;
  readonly id: string;
  readonly title: string;

  /** What the row's button is called, given its `title`. */
  readonly labelKey: string;
  readonly actions: readonly [RowAction, ...RowAction[]];
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <RowActions actions={actions}>
      <RowButton view={view} id={id} label={t(labelKey, { title })} onOpen={actions[0].run}>
        <span className="truncate font-ui-strong">{title}</span>
        {children}
      </RowButton>
    </RowActions>
  );
}

/** The button that is a row: pressed, it opens; selected, the palette acts on it. */
function RowButton({
  view,
  id,
  label,
  onOpen,
  children,
}: {
  readonly view: SessionsView;
  readonly id: string;
  readonly label: string;
  onOpen(): void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const selected = view.state.selected === id;

  return (
    <button
      type="button"
      aria-label={label}
      aria-current={selected ? 'true' : undefined}
      onFocus={() => {
        view.state.select(id);
      }}
      onClick={() => {
        view.state.select(id);
        onOpen();
      }}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-ui-sm hover:bg-accent',
        selected && 'bg-accent/60',
      )}
    >
      {children}
    </button>
  );
}

/** A live session of the folder: what it is doing, on what model, since when, from where. */
export function LiveSessionRow({
  view,
  session,
  title,
}: {
  readonly view: SessionsView;
  readonly session: LiveSessionSummary;
  readonly title: string;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const name = title === '' ? t('sessions.row.untitledSession') : title;
  const below = subfolderOf(view.folder, session.workspacePath);

  const actions: [RowAction, ...RowAction[]] = [
    rowAction('open', 'sessions.action.open', () => {
      view.openSession(session.sessionId);
    }),
    rowAction('copy', 'sessions.action.copyId', () => {
      view.copy.copy(session.claudeSessionId);
    }),
    rowAction('end', 'sessions.action.end', () => {
      view.endSession(session.sessionId);
    }),
  ];

  return (
    <li>
      <ActionRow
        view={view}
        id={session.sessionId}
        title={name}
        labelKey="sessions.row.openSession"
        actions={actions}
      >
        <span className="text-ui-xs text-muted-foreground">
          {t('sessions.row.liveDetails', {
            status: t(`session.status.${session.status}`),
            model: session.model,
            since: agoFrom(session.startedAt, new Date(), i18n.language),
          })}
        </span>
        {below !== null && (
          <span className="font-mono text-ui-xs text-muted-foreground">{below}</span>
        )}
        <span className="flex items-center gap-2 text-ui-xs text-muted-foreground">
          {session.openedFrom === 'mobile' && <Smartphone className="size-3" aria-hidden />}
          {t(`sessions.openedFrom.${session.openedFrom}`)}
          {session.pendingPermissions > 0 && (
            <span className="flex items-center gap-1 font-ui-strong text-warning">
              <TriangleAlert className="size-3" aria-hidden />
              {t('sessions.row.pending', { count: session.pendingPermissions })}
            </span>
          )}
        </span>
      </ActionRow>
    </li>
  );
}

/** When a conversation was last written: by the backend's clock when it said, by ours otherwise. */
function writtenWhen(conversation: ConversationSummary, locale: string): string {
  return conversation.writtenAgoSeconds === null
    ? agoFrom(conversation.lastModified, new Date(), locale)
    : ago(conversation.writtenAgoSeconds, locale);
}

/** Where a conversation came from — and on which branch, when the history says. */
function originLine(t: TFunction, conversation: ConversationSummary): string {
  const origin = t(`sessions.rowOrigin.${conversation.origin}`);

  return conversation.gitBranch === null
    ? origin
    : t('sessions.row.originOnBranch', { origin, branch: conversation.gitBranch });
}

/**
 * A conversation of the history, or one active elsewhere: its title, where it came from, when it was
 * written — "written n min ago", never "open in the editor", because that is all anybody knows
 * (D-06) — and the refusal of the last continue, when it was this row's.
 */
export function ConversationRow({
  view,
  conversation,
}: {
  readonly view: SessionsView;
  readonly conversation: ConversationSummary;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const name = conversation.summary === '' ? t('transcript.list.untitled') : conversation.summary;
  const below = subfolderOf(view.folder, conversation.cwd);
  const refusal = refusalFor(view, conversation.conversationId);
  const written = writtenWhen(conversation, i18n.language);

  const actions: [RowAction, ...RowAction[]] = [
    rowAction('open', 'sessions.action.read', () => {
      view.openConversation(conversation.conversationId);
    }),
    rowAction(
      'continue',
      conversation.origin === 'ours' ? 'sessions.action.continue' : 'sessions.action.fork',
      () => {
        view.continueConversation(conversation);
      },
    ),
    rowAction('copy', 'sessions.action.copyId', () => {
      view.copy.copy(conversation.conversationId);
    }),
  ];

  return (
    <li className="flex flex-col gap-1">
      <ActionRow
        view={view}
        id={conversation.conversationId}
        title={name}
        labelKey="sessions.row.openConversation"
        actions={actions}
      >
        <span className="text-ui-xs text-muted-foreground">{originLine(t, conversation)}</span>
        <span className="text-ui-xs text-muted-foreground">
          {t(
            conversation.activity === 'activeElsewhere'
              ? 'sessions.row.writtenAgo'
              : 'sessions.row.lastWritten',
            { when: written },
          )}
        </span>
        {below !== null && (
          <span className="font-mono text-ui-xs text-muted-foreground">{below}</span>
        )}
      </ActionRow>
      {refusal !== null && (
        <ErrorState
          error={refusal}
          onRetry={() => {
            view.continueConversation(conversation);
          }}
        />
      )}
      {refusal?.code === 'SESSION_LIMIT_REACHED' && (
        <p role="note" className="rounded bg-muted p-2 text-ui-xs">
          {t('sessions.limit.note', { seconds: refusal.params['retryAfterSeconds'] ?? 30 })}
        </p>
      )}
    </li>
  );
}
