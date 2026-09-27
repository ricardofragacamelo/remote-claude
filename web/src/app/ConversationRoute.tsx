import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { HistoryScreen } from '@/features/session';
import { useOpenSession } from './navigation';
import { Screen, SignedIn } from './Screen';

/**
 * `/history/:conversationId` — one conversation of the history, and the way to continue it.
 *
 * The id in the path is Claude's, not a live session's: a conversation outlives every session that
 * continued it. A resume ends on the live session it became, which is where this route navigates.
 */
export function ConversationRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const { conversationId } = useParams({ from: '/history/$conversationId' });
  // Stable across renders, because the resume rebuilds its subscription whenever it changes.
  const resumed = useOpenSession();

  return (
    <Screen title={t('history.screen.title')} links={[{ to: '/', label: t('audit.screen.back') }]}>
      <SignedIn returnTo={`/history/${conversationId}`}>
        <HistoryScreen conversationId={conversationId} onResumed={resumed} />
      </SignedIn>
    </Screen>
  );
}
