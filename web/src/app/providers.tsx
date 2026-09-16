import { useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';

import { api } from '@/shared/api/api';
import { credentials, setAccessToken, setLocale, setRenewer } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { createI18n, resolveLocale } from '@/shared/i18n';
import { renewSession, useAuthStore } from '@/features/auth';

/**
 * Query defaults.
 *
 * One retry, and never on a `4xx`: repeating a `403` does not change the answer, and repeating a
 * `401` without renewing first is a loop. See docs/architecture/web/04-state-and-data.md.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

/**
 * Everything the tree needs, and the one place the layers are wired together.
 *
 * `shared/` never imports `features/`, so the sign-in feature is joined to the transport here, by
 * pushing the token down rather than letting the transport reach up for it.
 */
export function Providers({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const session = useAuthStore((state) => state.session);
  const signedIn = useAuthStore((state) => state.signedIn);
  const locale = useMemo(() => resolveLocale(navigator.languages ?? ['en']), []);
  const i18n = useMemo(() => createI18n(locale), [locale]);

  useEffect(() => {
    setLocale(locale);
    api.useCredentials(credentials);
    setRenewer(async () => {
      const renewed = await renewSession();
      signedIn(renewed);
      return renewed.accessToken;
    });

    return () => setRenewer(null);
  }, [locale, signedIn]);

  useEffect(() => {
    setAccessToken(session?.accessToken ?? null);

    if (session === null) {
      wsClient.close();
      return;
    }

    // An access token expiring on an open socket does not drop it: the renewed one is handed over
    // and the connection carries on. See docs/architecture/shared/05-websocket-protocol.md.
    wsClient.connect();
    wsClient.reauthenticate(session.accessToken);
  }, [session]);

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}
