import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { SignInPrompt, useAuth } from '@/features/auth';
import { Skeleton } from '@/shared/components/ui/skeleton';

/** A way to another screen, beside the heading. */
export interface ScreenLink {
  readonly to: '/' | '/rules' | '/audit';

  /** Already translated. */
  readonly label: string;
}

export interface ScreenProps {
  /** Already translated. */
  readonly title: string;

  /** Where the heading leads, when it leads anywhere. */
  readonly links?: readonly ScreenLink[] | undefined;

  readonly children: ReactNode;
}

/**
 * The frame every route of the application shares: one column, a heading, and the ways to the
 * other screens beside it.
 *
 * Written once because "every screen is one readable column that works on a phone" is a decision
 * about the product, not about each route — and three routes that each spelled out the same
 * `<main>` were three chances for one of them to forget the phone
 * (docs/architecture/web/03-ui-system.md#responsividade).
 */
export function Screen({ title, links = [], children }: ScreenProps): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        {links.length > 0 && (
          <nav className="flex flex-wrap gap-4">
            {links.map((link) => (
              <Link key={link.to} to={link.to} className="text-sm underline underline-offset-4">
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
      {children}
    </main>
  );
}

export interface SignedInProps {
  /** Where the sign-in comes back to, so a deep link survives the round trip. */
  readonly returnTo: string;

  readonly children: ReactNode;
}

/**
 * What a route shows only to somebody signed in.
 *
 * While the sign-in is still unknown it renders a loading state rather than deciding: deciding too
 * early sends a signed-in user to the login screen on every refresh.
 */
export function SignedIn({ returnTo, children }: SignedInProps): React.JSX.Element {
  const { t } = useTranslation();
  const { isAuthenticated, isResolving } = useAuth();

  if (isResolving) {
    return <Skeleton className="h-48 w-full" aria-label={t('auth.callback.pending')} />;
  }

  return isAuthenticated ? <>{children}</> : <SignInPrompt returnTo={returnTo} />;
}
