import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useConversationHistory } from '../hooks/useConversationHistory';
import type { ConversationHistory } from '../hooks/useConversationHistory';
import { useResumeSession } from '../hooks/useResumeSession';
import type { ResumeControl } from '../hooks/useResumeSession';
import type { ConversationSummary } from '../types/history';
import { useScrollKeeper } from '../hooks/useScrollKeeper';
import { taskListOf } from '../lib/task-list';
import { tabKeyOf } from '../store/claude-panel.store';
import { TaskStrip } from './composer/TaskStrip';
import { Conversation } from './Conversation';
import { ChatFrame } from './frame/ChatFrame';
import { ForkDialog } from './sessions/ForkDialog';
import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import { IconButton } from '@/shared/components/IconButton';
import { LoadMore } from '@/shared/components/LoadMore';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';

export interface ConversationReaderProps {
  /** The conversation the panel reads — its id in Claude's store. */
  readonly conversationId: string;

  /**
   * Called with the live session a resume became. Stable across renders, and the workbench's to act
   * on: the panel shows that session from then on.
   */
  onResumed(sessionId: string): void;

  /** The panel stops reading it. */
  onClose(): void;

  /** The folder of the tab whose panel reads it — where its scroll is kept (plan 09, B-05). */
  readonly folder?: string;
}

/**
 * One conversation of the history, read in the panel of its folder tab — and the way to continue it
 * (plan 08, B-10 and B-12). It was the history screen of plan 04, whose route plan 06 removed; it
 * lives in the panel now, beside the explorer and the editor.
 *
 * The four states are the first page's; after it, "load earlier" reaches back a page at a time and
 * a failure there leaves what is already on screen, with the reason beside the button. The page is
 * read-only by construction: the transcript is Claude's file, shared with the editor, and nothing
 * here writes to it.
 *
 * A conversation begun elsewhere continues **under a new id**, and the screen says so before the
 * button is pressed: the editor will not see what is answered here. The promise is editor → phone,
 * and it was only ever that one ([D-04](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 *
 * In the frame of the panel (plan 09, B-05), the way to continue it stays under the conversation, as
 * the box of a session does.
 *
 * It imports hooks, and nothing else: no service, no `api.ts`.
 */
export function ConversationReader({
  conversationId,
  onResumed,
  onClose,
  folder = '',
}: ConversationReaderProps): React.JSX.Element {
  const { t } = useTranslation();
  const history = useConversationHistory(conversationId);
  const { summary, conversation } = history;
  const keeper = useScrollKeeper(folder, tabKeyOf('conversation', conversationId));
  const title =
    summary === null || summary.summary === '' ? t('history.screen.title') : summary.summary;

  const target = useMemo(
    () => (summary === null ? null : { conversationId, workspacePath: summary.cwd }),
    [conversationId, summary],
  );
  const resume = useResumeSession(target, onResumed);
  const taskList = useMemo(() => taskListOf(conversation.tools), [conversation.tools]);

  return (
    <ChatFrame
      label={title}
      keeper={keeper}
      header={
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <h3 className="truncate text-ui-sm font-ui-strong">{title}</h3>
            <p className="text-ui-xs text-muted-foreground">{t('history.screen.description')}</p>
          </div>
          <IconButton icon={X} label={t('history.screen.close')} onClick={onClose} />
        </div>
      }
      dock={
        summary !== null && (
          <>
            <TaskStrip list={taskList} />
            <ResumeControls resume={resume} summary={summary} />
          </>
        )
      }
    >
      {history.isLoading && (
        <Skeleton className="h-24 w-full" aria-label={t('history.screen.loading')} />
      )}

      {!history.isLoading && history.error !== null && (
        <ErrorState error={history.error} onRetry={history.reload} />
      )}

      {summary !== null && (
        <>
          <Origin summary={summary} />

          <LoadMore
            hasMore={history.hasEarlier}
            isLoading={history.isLoadingEarlier}
            error={history.earlierError}
            onLoadMore={history.loadEarlier}
            label={t('history.screen.loadEarlier')}
            loadingLabel={t('history.screen.loadingEarlier')}
          />

          <Transcript
            conversation={conversation}
            conversationId={conversationId}
            folder={summary.cwd}
            onSearchEverything={history.hasEarlier ? history.loadEverything : undefined}
          />
        </>
      )}
    </ChatFrame>
  );
}

/** Where the conversation came from and where it ran — and, when begun elsewhere, what that means. */
function Origin({ summary }: { readonly summary: ConversationSummary }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <p className="text-xs opacity-70">
        {t(summary.origin === 'ours' ? 'history.origin.ours' : 'history.origin.external')}
      </p>
      <p className="font-mono text-xs opacity-70">{summary.cwd}</p>

      {summary.origin === 'external' && (
        <p className="rounded bg-muted p-2 text-xs" role="note">
          {t('history.screen.externalNote')}
        </p>
      )}

      {summary.activity === 'activeElsewhere' && (
        <p className="rounded bg-muted p-2 text-xs" role="note">
          {t('history.screen.activeElsewhereNote')}
        </p>
      )}
    </>
  );
}

/**
 * The button that continues the conversation, and why it cannot be pressed when it cannot. One that
 * something else is writing now asks first (S-42).
 */
function ResumeControls({
  resume,
  summary,
}: {
  readonly resume: ResumeControl;
  readonly summary: ConversationSummary;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);

  return (
    <>
      <Button
        size="touch"
        className="self-start"
        disabled={resume.isResuming || resume.connection !== 'ready'}
        onClick={() => {
          if (summary.activity === 'activeElsewhere') {
            setAsking(true);
          } else {
            resume.resume();
          }
        }}
      >
        {resume.isResuming ? t('history.screen.resuming') : t('history.screen.resume')}
      </Button>

      {resume.connection !== 'ready' && (
        <p className="text-xs opacity-70">{t(`connection.status.${resume.connection}`)}</p>
      )}

      {resume.error !== null && <ErrorState error={resume.error} />}

      <ForkDialog
        fork={
          asking
            ? {
                conversation: summary,
                confirm: () => {
                  setAsking(false);
                  resume.resume();
                },
                cancel: () => {
                  setAsking(false);
                },
              }
            : null
        }
      />
    </>
  );
}

/** What was said, or that nothing was. */
function Transcript({
  conversation,
  conversationId,
  folder,
  onSearchEverything,
}: {
  readonly conversation: ConversationHistory['conversation'];
  readonly conversationId: string;
  readonly folder: string;
  readonly onSearchEverything: (() => void) | undefined;
}): React.JSX.Element {
  const { t } = useTranslation();

  return conversation.timeline.length === 0 ? (
    <EmptyState
      title={t('history.screen.emptyTitle')}
      description={t('history.screen.emptyDescription')}
    />
  ) : (
    <Conversation
      conversation={conversation}
      isPartial={false}
      folder={folder}
      conversationId={conversationId}
      {...(onSearchEverything === undefined ? {} : { onSearchEverything })}
    />
  );
}
