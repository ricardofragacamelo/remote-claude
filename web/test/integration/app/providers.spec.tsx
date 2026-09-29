import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { useTranslation } from 'react-i18next';

import { Providers } from '@/app/providers';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { credentials, currentLocale, setLocale } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { installFakeWebSocket } from '../../support/fake-websocket';
import type { InstalledWebSocket } from '../../support/fake-websocket';
import { translator } from '../../support/render';

/** A probe that only proves the i18n provider is in place. */
function Probe(): React.JSX.Element {
  const { t } = useTranslation();
  return <p>{t('session.ping.title')}</p>;
}

const session = {
  accessToken: 'token-1',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

describe('the providers', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    useAuthStore.setState({ status: 'anonymous', session: null });
    sockets = installFakeWebSocket();
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    wsClient.close();
    vi.restoreAllMocks();
    setLocale('en');
  });

  it('puts the translations in place for the tree below', async () => {
    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Round trip')).toBeInTheDocument();
    });
  });

  it('opens no socket while nobody is signed in', () => {
    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(sockets.created).toHaveLength(0);
  });

  it('hands the token to the transport, and opens the socket, once somebody signs in', async () => {
    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    useAuthStore.getState().signedIn(session);

    await waitFor(() => {
      expect(credentials.accessToken()).toBe('token-1');
    });
    expect(sockets.created).toHaveLength(1);
  });

  it('S-85 — the first request of a screen that mounts with the sign-in already carries the token', () => {
    const seen: (string | null)[] = [];

    /** A screen that asks for data as it mounts, as every list does. */
    function AsksOnMount(): null {
      useEffect(() => {
        seen.push(credentials.accessToken());
      }, []);
      return null;
    }

    /** Mounts the screen in the same commit the sign-in lands in. */
    function SignedInOnly(): React.JSX.Element | null {
      return useAuthStore((state) => state.session) === null ? null : <AsksOnMount />;
    }

    rtlRender(
      <Providers>
        <SignedInOnly />
      </Providers>,
    );

    act(() => {
      useAuthStore.getState().signedIn(session);
    });

    expect(seen).toEqual(['token-1']);
  });

  it('renews through the transport, so a 401 becomes one refresh and a repeat', async () => {
    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    await waitFor(async () => {
      await expect(credentials.renew()).resolves.toBe('token-1');
    });
    expect(useAuthStore.getState().session).toEqual(session);
  });

  it('speaks the language the browser prefers', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['pt-BR', 'en']);

    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(await screen.findByText(translator('pt-BR')('session.ping.title'))).toBeInTheDocument();
    expect(currentLocale()).toBe('pt-BR');
  });

  it('falls back to English when the browser names no language at all', async () => {
    // Some embedded browsers expose no `navigator.languages`; the screen still has to speak one.
    setLocale('pt-BR');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(
      undefined as unknown as readonly string[],
    );

    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(await screen.findByText(translator('en')('session.ping.title'))).toBeInTheDocument();
    expect(currentLocale()).toBe('en');
  });
});
