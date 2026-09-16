import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { completeLogin, returnRoute, useAuthStore } from '@/features/auth';
import { AppError } from '@/shared/api/errors';
import { ErrorState } from '@/shared/components/ErrorState';
import { navigation } from '@/shared/lib/navigation';
import { Skeleton } from '@/shared/components/ui/skeleton';

/**
 * Where the provider sends the browser back.
 *
 * It validates `state`, exchanges the code and goes back to the route the sign-in started from —
 * so a deep link survives the round trip instead of dropping the user on the home page.
 */
export function Callback(): React.JSX.Element {
  const { t } = useTranslation();
  const signedIn = useAuthStore((state) => state.signedIn);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    let cancelled = false;

    void completeLogin(new URLSearchParams(navigation.search()))
      .then((session) => {
        if (cancelled) {
          return;
        }

        signedIn(session);
        navigation.replace(returnRoute());
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setError(
            failure instanceof AppError
              ? failure
              : new AppError('INTERNAL_ERROR', 'common.error.unexpected', 'callback'),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (error !== null) {
    return <ErrorState error={error} />;
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Skeleton className="h-24 w-full" aria-label={t('auth.callback.pending')} />
    </main>
  );
}
