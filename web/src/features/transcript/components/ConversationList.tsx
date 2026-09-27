import { useTranslation } from 'react-i18next';

import { useConversations } from '../hooks/useConversations';
import { LoadedList } from '@/shared/components/LoadedList';
import type { ListKeys } from '@/shared/components/LoadedList';
import { LoadMore } from '@/shared/components/LoadMore';
import { Button } from '@/shared/components/ui/button';

/** Named as literals, so the orphan check can see that the catalogue entries are in use. */
const KEYS: ListKeys = {
  title: 'transcript.list.title',
  description: 'transcript.list.description',
  loading: 'transcript.list.loading',
  emptyTitle: 'transcript.list.emptyTitle',
  emptyDescription: 'transcript.list.emptyDescription',
};

export interface ConversationListProps {
  /** The workspace whose conversations these are. It is the URL's. */
  readonly workspacePath: string;

  /** Opens one conversation. The route's to perform: the feature never learns the router exists. */
  onOpen(conversationId: string): void;
}

/**
 * The second level of the history: the conversations of one workspace
 * ([D-03](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 *
 * Every row says where it came from, because a conversation begun in the editor showing up here is
 * a feature and has to read as one — without the label it looks like data leaking from somewhere
 * else (S-11). The label is "begun elsewhere", never "VSCode": nothing reports which it was.
 *
 * The four states are the list's; "load more" appends the next page, and a failure there is shown
 * beside the button while every row already read stays on screen.
 *
 * It imports hooks, and nothing else: no service, no `api.ts`.
 */
export function ConversationList({
  workspacePath,
  onOpen,
}: ConversationListProps): React.JSX.Element {
  const { t } = useTranslation();
  const { isLoading, error, conversations, hasMore, isLoadingMore, moreError, loadMore, reload } =
    useConversations(workspacePath);

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-xs opacity-70">{workspacePath}</p>

      <LoadedList
        keys={KEYS}
        isLoading={isLoading}
        error={error}
        isEmpty={conversations.length === 0}
        onRetry={reload}
      >
        {conversations.map((conversation) => (
          <li key={conversation.conversationId}>
            <Button
              variant="outline"
              size="touch"
              className="h-auto w-full justify-start py-2"
              onClick={() => {
                onOpen(conversation.conversationId);
              }}
            >
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span className="text-sm font-medium">
                  {conversation.summary === ''
                    ? t('transcript.list.untitled')
                    : conversation.summary}
                </span>
                <span className="text-xs opacity-70">
                  {t(
                    conversation.origin === 'ours'
                      ? 'history.origin.ours'
                      : 'history.origin.external',
                  )}
                </span>
                <span className="text-xs opacity-70">
                  {conversation.gitBranch === null
                    ? t('transcript.list.lastModified', { at: conversation.lastModified })
                    : t('transcript.list.lastModifiedOnBranch', {
                        at: conversation.lastModified,
                        branch: conversation.gitBranch,
                      })}
                </span>
              </span>
            </Button>
          </li>
        ))}
      </LoadedList>

      <LoadMore
        hasMore={hasMore}
        isLoading={isLoadingMore}
        error={moreError}
        onLoadMore={loadMore}
        label={t('transcript.list.loadMore')}
        loadingLabel={t('transcript.list.loadingMore')}
      />
    </div>
  );
}
