import { useEffect, useLayoutEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';

import { api } from '@/shared/api/api';
import { credentials, setAccessToken, setLocale, setRenewer } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { useLocale } from '@/shared/hooks/useLocale';
import { applyDensity, useDensity } from '@/shared/hooks/useDensity';
import { applyTheme, DARK_SCHEME, useTheme } from '@/shared/hooks/useTheme';
import { createI18n } from '@/shared/i18n';
import { renewSession, useAuthStore } from '@/features/auth';
import { forgetPermissionQueues } from '@/features/permission';
import { forgetLiveSessions } from '@/features/session';
import { forgetFolderTabs } from '@/features/workbench';

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
  const status = useAuthStore((state) => state.status);
  const signedIn = useAuthStore((state) => state.signedIn);
  const locale = useLocale((state) => state.locale);
  const theme = useTheme((state) => state.theme);
  const density = useDensity((state) => state.density);
  // One instance for the life of the page: a language picked later is a change of language on it,
  // not a new tree (plan 06, S-114).
  const i18n = useMemo(() => createI18n(useLocale.getState().locale), []);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useLayoutEffect(() => {
    applyDensity(density);
  }, [density]);

  // "The system's" follows the system while the page is open — the store ignores it for somebody who
  // picked a theme by hand (plan 06, S-202).
  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') {
      return;
    }

    const query = globalThis.matchMedia(DARK_SCHEME);
    const changed = (): void => {
      useTheme.getState().systemChanged(query.matches);
    };

    query.addEventListener('change', changed);
    return () => {
      query.removeEventListener('change', changed);
    };
  }, []);

  useEffect(() => {
    void i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
  }, [i18n, locale]);

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

  // The token is in place before anything below asks for data. A child's effects run before its
  // parent's, so set in an ordinary effect here, the first request of a screen that mounts with the
  // sign-in left without it — refused with `401`, and a renewal spent on nothing, on every load
  // (plan 05, S-85). A layout effect runs before every ordinary one.
  useLayoutEffect(() => {
    setAccessToken(session?.accessToken ?? null);
  }, [session]);

  useEffect(() => {
    if (session === null) {
      // The previous user's data must not be on screen for the next one: the socket goes, and so
      // does every cached answer (docs/architecture/web/07-auth.md#logout).
      wsClient.close();
      queryClient.clear();
      return;
    }

    // An access token expiring on an open socket does not drop it: the renewed one is handed over
    // and the connection carries on. See docs/architecture/shared/05-websocket-protocol.md.
    wsClient.connect();
    wsClient.reauthenticate(session.accessToken);
  }, [session]);

  // What the sockets had brought, and what each folder tab held, go once nobody is signed in — a
  // sign-out, or a sign-in this browser could not renew: the next person to sign in here starts from
  // nothing. Not on the `null` every page load starts with: a reload of somebody still signed in is
  // still them, and their tabs get back what they kept (plan 06, S-208 — found by S-158).
  useEffect(() => {
    if (status === 'anonymous') {
      forgetLiveSessions();
      forgetPermissionQueues();
      forgetFolderTabs();
    }
  }, [status]);

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}
