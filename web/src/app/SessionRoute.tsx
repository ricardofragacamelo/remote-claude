import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { SignInPrompt, useAuth } from '@/features/auth';
import { PermissionQueuePanel } from '@/features/permission';
import { SessionScreen } from '@/features/session';
import { Skeleton } from '@/shared/components/ui/skeleton';

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
  const { isAuthenticated, isResolving } = useAuth();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4 md:p-8">
      <h1 className="text-xl font-semibold">{t('session.screen.title')}</h1>

      {isResolving && <Skeleton className="h-48 w-full" aria-label={t('auth.callback.pending')} />}
      {!isResolving && !isAuthenticated && <SignInPrompt returnTo={`/sessions/${sessionId}`} />}

      {isAuthenticated && (
        <>
          <SessionScreen sessionId={sessionId} />
          <PermissionQueuePanel sessionId={sessionId} />
        </>
      )}
    </main>
  );
}
