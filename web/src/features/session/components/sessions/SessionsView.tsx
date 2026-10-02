import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useCommands } from '@/features/commands';
import { useFolderTab } from '@/features/workbench';
import { LoadMore } from '@/shared/components/LoadMore';
import { sessionsViewCommands, useSessionsView } from '../../hooks/useSessionsView';
import type { SessionsView as View } from '../../hooks/useSessionsView';
import { ForkDialog } from './ForkDialog';
import { SessionGroupSection } from './SessionGroupSection';
import { ConversationRow, LiveSessionRow } from './SessionRows';
import { SessionsHelp } from './SessionsHelp';
import { SessionsToolbar } from './SessionsToolbar';

export interface SessionsViewProps {
  /** The real path of the folder of the tab. */
  readonly folder: string;
}

/**
 * The view "Claude sessions" of a folder tab (plan 08, F1): what runs here, what looks active
 * elsewhere — the editor, a terminal — and the history of the folder, each row leading to the right
 * way to join it: a live session is attached, a conversation opens in the panel, where it is
 * continued in place (ours) or forked (begun elsewhere).
 *
 * Everything in it is the tab's — the lists, the filters, the folded groups, the scroll (S-38) — and
 * it is mounted only while it is on screen in the active tab, which is what stops its polling with
 * the view hidden or the tab in the background (S-48).
 */
export function SessionsView({ folder }: SessionsViewProps): React.JSX.Element {
  const tab = useFolderTab(folder);
  const view = useSessionsView(folder, {
    showSession: tab.showSession,
    showConversation: tab.showConversation,
  });

  useCommands(sessionsViewCommands(view));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SessionsToolbar view={view} />
      <SessionsBody view={view} />
      <ForkDialog fork={view.pendingFork} />
      <SessionsHelp view={view} />
    </div>
  );
}

/** The three groups, in a list that comes back to where it was scrolled. */
function SessionsBody({ view }: { readonly view: View }): React.JSX.Element {
  const { t } = useTranslation();
  const restored = useRef(false);
  const { live, history } = view.sessions;
  const { scrollTop, setScrollTop } = view.state;

  // Once, when the view comes back: the list lands where the person left it.
  const list = useCallback(
    (node: HTMLDivElement | null) => {
      if (node !== null && !restored.current) {
        restored.current = true;
        node.scrollTop = scrollTop;
      }
    },
    [scrollTop],
  );

  return (
    <div
      ref={list}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-2"
      onScroll={(event) => {
        setScrollTop(event.currentTarget.scrollTop);
      }}
    >
      <SessionGroupSection
        view={view}
        content={{
          group: 'running',
          count: view.running.length,
          isLoading: live.isLoading,
          error: live.error,
          onRetry: live.reload,
          children: view.running.map(({ session, title }) => (
            <LiveSessionRow key={session.sessionId} view={view} session={session} title={title} />
          )),
        }}
      />
      <SessionGroupSection
        view={view}
        content={{
          group: 'elsewhere',
          count: view.elsewhere.length,
          isLoading: history.isLoading,
          error: history.error,
          onRetry: history.reload,
          children: view.elsewhere.map((conversation) => (
            <ConversationRow
              key={conversation.conversationId}
              view={view}
              conversation={conversation}
            />
          )),
        }}
      />
      <SessionGroupSection
        view={view}
        content={{
          group: 'history',
          count: view.history.length,
          isLoading: history.isLoading,
          error: history.error,
          onRetry: history.reload,
          children: view.history.map((conversation) => (
            <ConversationRow
              key={conversation.conversationId}
              view={view}
              conversation={conversation}
            />
          )),
          footer: (
            <LoadMore
              hasMore={history.hasMore}
              isLoading={history.isLoadingMore}
              error={history.moreError}
              onLoadMore={history.loadMore}
              label={t('sessionsGroup.history.loadMore')}
              loadingLabel={t('sessionsGroup.history.loadingMore')}
            />
          ),
        }}
      />
    </div>
  );
}
