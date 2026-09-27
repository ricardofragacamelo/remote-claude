import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useConversationHistory } from '../hooks/useConversationHistory';
import { useResumeSession } from '../hooks/useResumeSession';
import { Conversation } from './Conversation';
import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import { LoadMore } from '@/shared/components/LoadMore';
import { Panel } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';

export interface HistoryScreenProps {
  /** The conversation in the URL — its id in Claude's store. */
  readonly conversationId: string;

  /**
   * Called with the live session a resume became. Stable across renders, and the route's to act
   * on: the feature never learns the router exists.
   */
  onResumed(sessionId: string): void;
}

/**
 * One conversation of the history, read — and the way to continue it.
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
 * It imports hooks, and nothing else: no service, no `api.ts`.
 */
export function HistoryScreen({
  conversationId,
  onResumed,
}: HistoryScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const history = useConversationHistory(conversationId);
  const { summary, conversation } = history;

  const target = useMemo(
    () => (summary === null ? null : { conversationId, workspacePath: summary.cwd }),
    [conversationId, summary],
  );
  const resume = useResumeSession(target, onResumed);
  const isEmpty = conversation.messages.length === 0 && conversation.tools.length === 0;

  return (
    <Panel
      title={
        summary === null || summary.summary === '' ? t('history.screen.title') : summary.summary
      }
      description={t('history.screen.description')}
    >
      {history.isLoading && (
        <Skeleton className="h-24 w-full" aria-label={t('history.screen.loading')} />
      )}

      {!history.isLoading && history.error !== null && (
        <ErrorState error={history.error} onRetry={history.reload} />
      )}

      {summary !== null && (
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

          <Button
            size="touch"
            className="self-start"
            disabled={resume.isResuming || resume.connection !== 'ready'}
            onClick={resume.resume}
          >
            {resume.isResuming ? t('history.screen.resuming') : t('history.screen.resume')}
          </Button>

          {resume.connection !== 'ready' && (
            <p className="text-xs opacity-70">{t(`connection.status.${resume.connection}`)}</p>
          )}

          {resume.error !== null && <ErrorState error={resume.error} />}

          <LoadMore
            hasMore={history.hasEarlier}
            isLoading={history.isLoadingEarlier}
            error={history.earlierError}
            onLoadMore={history.loadEarlier}
            label={t('history.screen.loadEarlier')}
            loadingLabel={t('history.screen.loadingEarlier')}
          />

          {isEmpty ? (
            <EmptyState
              title={t('history.screen.emptyTitle')}
              description={t('history.screen.emptyDescription')}
            />
          ) : (
            <Conversation
              messages={conversation.messages}
              tools={conversation.tools}
              isPartial={false}
            />
          )}
        </>
      )}
    </Panel>
  );
}
