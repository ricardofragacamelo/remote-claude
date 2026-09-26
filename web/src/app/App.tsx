import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/features/auth';
import { DeviceList } from '@/features/devices';
import { SessionPingPanel, SessionStarter } from '@/features/session';
import { useWorkspaceStore, WorkspaceSelector } from '@/features/workspace';
import { Screen, SignedIn } from './Screen';

/**
 * The shell.
 *
 * While the sign-in is still unknown it renders a loading state rather than redirecting: deciding
 * too early sends a signed-in user to the login screen on every refresh.
 */
export function App(): React.JSX.Element {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
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
    <Screen
      title={t('session.starter.title')}
      links={
        isAuthenticated
          ? [
              { to: '/rules', label: t('rules.screen.open') },
              { to: '/audit', label: t('audit.screen.open') },
            ]
          : undefined
      }
    >
      <SignedIn returnTo="/">
        <WorkspaceSelector />
        <SessionStarter workspacePath={workspacePath} onStarted={open} />
        <SessionPingPanel />
        <DeviceList />
      </SignedIn>
    </Screen>
  );
}
