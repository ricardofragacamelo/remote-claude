import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { SignInPrompt, useAuth } from '@/features/auth';
import { SessionPingPanel, SessionStarter } from '@/features/session';
import { useWorkspaceStore, WorkspaceSelector } from '@/features/workspace';
import { Skeleton } from '@/shared/components/ui/skeleton';

/**
 * The shell.
 *
 * While the sign-in is still unknown it renders a loading state rather than redirecting: deciding
 * too early sends a signed-in user to the login screen on every refresh.
 */
export function App(): React.JSX.Element {
  const { t } = useTranslation();
  const { isAuthenticated, isResolving } = useAuth();
  const workspacePath = useWorkspaceStore((state) => state.selected);
  const navigate = useNavigate();

  // Stable across renders, because the starter rebuilds its subscription whenever it changes.
  const open = useCallback(
    (sessionId: string) => {
      void navigate({ to: '/sessions/$sessionId', params: { sessionId } });
    },
    [navigate],
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4 md:p-8">
      <h1 className="text-xl font-semibold">{t('session.starter.title')}</h1>

      {isResolving && <Skeleton className="h-48 w-full" aria-label={t('auth.callback.pending')} />}
      {!isResolving && !isAuthenticated && <SignInPrompt returnTo="/" />}
      {isAuthenticated && <WorkspaceSelector />}
      {isAuthenticated && <SessionStarter workspacePath={workspacePath} onStarted={open} />}
      {isAuthenticated && <SessionPingPanel />}
    </main>
  );
}
