import { useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { ConversationList } from '@/features/transcript';
import { EmptyState } from '@/shared/components/EmptyState';
import { useOpenConversation } from './navigation';
import { Screen, SignedIn } from './Screen';

/** The search of the history: which workspace, when one is named. */
export interface HistorySearch {
  readonly workspacePath?: string;
}

/**
 * The workspace of the history, read from the URL — and only when it is well formed.
 *
 * Whether the path may be read is the backend's question, answered against the allowlist; the
 * link only has to name one. A malformed one is dropped rather than sent.
 */
export function readHistorySearch(search: Readonly<Record<string, unknown>>): HistorySearch {
  const path = search['workspacePath'];

  return typeof path === 'string' && path.trim() !== '' ? { workspacePath: path.trim() } : {};
}

/** The history's own address, workspace included — where a sign-in comes back to. */
export function historyLocation(search: HistorySearch): string {
  return search.workspacePath === undefined
    ? '/history'
    : `/history?${new URLSearchParams({ workspacePath: search.workspacePath }).toString()}`;
}

/**
 * `/history?workspacePath=` — the conversations of one workspace.
 *
 * The second of the two levels ([D-03](../../../../docs/plans/04-transcript-and-resume/decisions.md)):
 * the first is the allowlist on the start screen, and the fence it draws stays visible in the
 * navigation instead of hiding in a filter. The workspace is in the **search**, so the list is a
 * link (docs/architecture/web/04-state-and-data.md#a-url-é-estado).
 */
export function HistoryRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const search = useSearch({ from: '/history' });
  const open = useOpenConversation();

  return (
    <Screen
      title={t('transcript.screen.title')}
      links={[{ to: '/', label: t('audit.screen.back') }]}
    >
      <SignedIn returnTo={historyLocation(search)}>
        {search.workspacePath === undefined ? (
          <EmptyState
            title={t('transcript.screen.noWorkspaceTitle')}
            description={t('transcript.screen.noWorkspaceDescription')}
          />
        ) : (
          <ConversationList workspacePath={search.workspacePath} onOpen={open} />
        )}
      </SignedIn>
    </Screen>
  );
}
