import type { ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { SignInPrompt, useAuth } from '@/features/auth';
import { ScreenLoading } from './ScreenLoading';

export interface SignedInProps {
  readonly children: ReactNode;
}

/**
 * What the frame shows only to somebody signed in — every screen but "not found".
 *
 * The way back after the sign-in is the address on screen, **search included**: a filtered trail or
 * a folder opened from a link, opened signed out, comes back as it was asked for (plan 06, S-91).
 * While the sign-in is still unknown it renders a loading state rather than deciding: deciding too
 * early sends a signed-in user to the login screen on every refresh.
 */
export function SignedIn({ children }: SignedInProps): React.JSX.Element {
  const { t } = useTranslation();
  const { isAuthenticated, isResolving } = useAuth();
  const returnTo = useRouterState({ select: (state) => state.location.href });

  if (isResolving) {
    return <ScreenLoading label={t('auth.callback.pending')} />;
  }

  return isAuthenticated ? (
    <>{children}</>
  ) : (
    <div className="flex flex-1 items-start justify-center p-4 md:p-8">
      <SignInPrompt returnTo={returnTo} />
    </div>
  );
}
