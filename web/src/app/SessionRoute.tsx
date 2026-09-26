import { useCallback } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { PermissionQueuePanel } from '@/features/permission';
import { SessionScreen } from '@/features/session';
import { Screen, SignedIn } from './Screen';

/**
 * `/sessions/:sessionId` — the session, reproduced from the URL alone.
 *
 * The session on screen is **navigation state**, so it lives in the path: pasting the link on
 * another device has to bring up the same screen, and that is the test the architecture states
 * (docs/architecture/web/04-state-and-data.md#a-url-é-estado).
 *
 * The queue is a panel of its own beside the conversation, because it is a different feature
 * watching the same session — neither knows the other exists.
 */
export function SessionRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const { sessionId } = useParams({ from: '/sessions/$sessionId' });
  const navigate = useNavigate();

  // The way from a "don't ask again" to the list that takes it back — one of the two entrances
  // D-04 requires, handed down so the feature itself never learns the router exists.
  const openRules = useCallback(() => {
    void navigate({ to: '/rules' });
  }, [navigate]);

  return (
    <Screen title={t('session.screen.title')}>
      <SignedIn returnTo={`/sessions/${sessionId}`}>
        <SessionScreen sessionId={sessionId} />
        <PermissionQueuePanel sessionId={sessionId} onOpenRules={openRules} />
      </SignedIn>
    </Screen>
  );
}
