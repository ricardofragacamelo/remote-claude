import { useMemo, useRef } from 'react';
import type { TFunction } from 'i18next';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { IconButton } from '@/shared/components/IconButton';
import { Button } from '@/shared/components/ui/button';
import { useConversationSearch } from '../hooks/useConversationSearch';
import { useFollowTail } from '../hooks/useFollowTail';
import type { ConversationSearch } from '../hooks/useConversationSearch';
import type { Conversation as ConversationState } from '../types/live-session';
import { taskListOf } from '../lib/task-list';
import { TaskListPanel } from './conversation/TaskListPanel';
import { TimelineEntries } from './conversation/TimelineEntries';
import type { TimelineContext } from './conversation/timeline-context';

export interface ConversationProps {
  readonly conversation: Pick<ConversationState, 'messages' | 'tools' | 'timeline' | 'turns'>;

  /** What is on screen is only what the replay buffer still held. */
  readonly isPartial: boolean;

  /** The real path of the folder of the tab — what names of files and tools are relative to. */
  readonly folder?: string;

  /** The live session — `null` reading the history. */
  readonly sessionId?: string | null;

  /** The conversation in Claude's store — what a subagent of the history is read by. */
  readonly conversationId?: string | null;

  /** Brings the rest of the conversation, for a search of the whole of it (S-101). */
  onSearchEverything?(): void;

  /** Edits a prompt to send it again, and forks from before one (plan 08, B-35). */
  readonly onEditPrompt?: TimelineContext['onEditPrompt'];
  readonly onForkFrom?: TimelineContext['onForkFrom'];
}

/**
 * The conversation, as the editor's extension shows it (plan 08, F2): messages, tools and the end of
 * each turn **in the order they happened**, thinking folded, a subagent nested under its tool.
 *
 * The **partial** label is not a nicety. A session opened after it ended shows whatever the ring
 * buffer still has, and without saying so an absence of content reads as an absence of activity —
 * which is worse than showing nothing at all
 * ([D-10](../../../../../docs/plans/01-live-session/decisions.md)).
 *
 * `Ctrl/Cmd+F` with the focus in it opens a search of what is loaded (B-24). With the person at the
 * end, what arrives keeps the end in view; scrolled up, it leaves them where they read (S-81).
 */
export function Conversation({
  conversation,
  isPartial,
  folder = '',
  sessionId = null,
  conversationId = null,
  onSearchEverything,
  onEditPrompt,
  onForkFrom,
}: ConversationProps): React.JSX.Element {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const search = useConversationSearch(conversation.messages, container);
  useFollowTail(container, conversation);
  const taskList = useMemo(() => taskListOf(conversation.tools), [conversation.tools]);

  const context: TimelineContext = {
    folder,
    sessionId,
    conversationId,
    conversation,
    current: search.found[search.at] ?? null,
    taskList,
    onEditPrompt,
    onForkFrom,
  };

  return (
    <div ref={container} className="flex flex-col gap-4">
      {isPartial && (
        <p className="rounded bg-muted p-2 text-xs" role="note">
          {t('session.screen.partial')}
        </p>
      )}

      {search.query !== null && (
        <SearchBar query={search.query} search={search} onSearchEverything={onSearchEverything} />
      )}

      <TaskListPanel list={taskList} />

      {conversation.timeline.length === 0 ? (
        <EmptyState
          title={t('session.screen.emptyTitle')}
          description={t('session.screen.emptyDescription')}
        />
      ) : (
        <TimelineEntries context={context} parent={null} />
      )}
    </div>
  );
}

/** What the search says of where it is: nothing yet, nothing found, or which occurrence of how many. */
function positionOf(search: ConversationSearch, t: TFunction): string {
  if (search.query === null || search.query.trim() === '') {
    return '';
  }

  return search.found.length === 0
    ? t('sessions.search.none')
    : t('sessions.search.position', { at: search.at + 1, count: search.found.length });
}

/** The bar of the search: the field, where it is, and the way to move and to close. */
function SearchBar({
  query,
  search,
  onSearchEverything,
}: {
  readonly query: string;
  readonly search: ConversationSearch;
  readonly onSearchEverything: ConversationProps['onSearchEverything'];
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      role="search"
      className="flex flex-wrap items-center gap-1 rounded-md border border-border p-1"
    >
      <label className="sr-only" htmlFor="conversation-search">
        {t('sessions.search.label')}
      </label>
      <input
        id="conversation-search"
        type="search"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- opened by Ctrl/Cmd+F, which asks for the field
        autoFocus
        value={query}
        onChange={(event) => {
          search.setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') search.go(event.shiftKey ? -1 : 1);
          if (event.key === 'Escape') search.close();
        }}
        className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-ui-sm"
      />
      <span role="status" className="text-ui-xs text-muted-foreground">
        {positionOf(search, t)}
      </span>
      <IconButton
        icon={ChevronUp}
        label={t('sessions.search.previous')}
        onClick={() => {
          search.go(-1);
        }}
      />
      <IconButton
        icon={ChevronDown}
        label={t('sessions.search.next')}
        onClick={() => {
          search.go(1);
        }}
      />
      {onSearchEverything !== undefined && (
        <Button variant="outline" onClick={onSearchEverything}>
          {t('sessions.search.everything')}
        </Button>
      )}
      <IconButton icon={X} label={t('sessions.search.close')} onClick={search.close} />
    </div>
  );
}
