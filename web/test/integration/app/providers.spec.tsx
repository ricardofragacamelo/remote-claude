import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { useTranslation } from 'react-i18next';

import { Providers } from '@/app/providers';
import { useAuthStore } from '@/features/auth';
import { permissionQueueOf } from '@/features/permission';
import { liveSessionStoreOf } from '@/features/session';
import { useFolderTab } from '@/features/workbench';
import { useDensity } from '@/shared/hooks/useDensity';
import { useTheme } from '@/shared/hooks/useTheme';
import * as authService from '@/features/auth/services/auth.service';
import { credentials, currentLocale, setLocale } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { initialLocale, useLocale } from '@/shared/hooks/useLocale';
import { installFakeWebSocket } from '../../support/fake-websocket';
import type { InstalledWebSocket } from '../../support/fake-websocket';
import { translator } from '../../support/render';

/** A probe that only proves the i18n provider is in place. */
function Probe(): React.JSX.Element {
  const { t } = useTranslation();
  return <p>{t('diagnostics.ping.title')}</p>;
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

  it('forgets what the last person’s sessions and tabs held, once they sign out — S-191', async () => {
    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );
    useAuthStore.getState().signedIn(session);
    await waitFor(() => {
      expect(sockets.created).toHaveLength(1);
    });
    const conversation = liveSessionStoreOf('S1');
    const questions = permissionQueueOf('S1');
    const { result } = renderHook(() => useFolderTab('/srv/projects/a'));
    act(() => {
      result.current.setDraft('the last person’s words');
    });

    act(() => {
      useAuthStore.getState().signedOut();
    });

    await waitFor(() => {
      expect(liveSessionStoreOf('S1')).not.toBe(conversation);
    });
    expect(permissionQueueOf('S1')).not.toBe(questions);
    expect(renderHook(() => useFolderTab('/srv/projects/a')).result.current.draft).toBe('');
  });

  it('keeps what the tabs held through a page load of somebody still signed in — S-208', async () => {
    // What the page before this one left: a tab with its side bar hidden.
    const before = renderHook(() => useFolderTab('/srv/projects/b'));
    act(() => {
      before.result.current.toggleSideBar();
    });
    before.unmount();
    useAuthStore.setState({ status: 'unknown', session: null });

    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );
    act(() => {
      useAuthStore.getState().signedIn(session);
    });
    await waitFor(() => {
      expect(sockets.created).toHaveLength(1);
    });

    expect(renderHook(() => useFolderTab('/srv/projects/b')).result.current.sideBarOpen).toBe(
      false,
    );
    expect(globalThis.localStorage.getItem('rc.visitor.workbench.tabState')).toContain(
      '/srv/projects/b',
    );
  });

  it('forgets what the tabs held when the page finds nobody signed in — S-208', () => {
    const before = renderHook(() => useFolderTab('/srv/projects/c'));
    act(() => {
      before.result.current.toggleSideBar();
    });
    before.unmount();

    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(renderHook(() => useFolderTab('/srv/projects/c')).result.current.sideBarOpen).toBe(true);
  });

  it('puts the theme of this visitor on the page, and follows a change', async () => {
    useTheme.setState({ theme: 'dark' });
    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    act(() => {
      useTheme.getState().setTheme('light');
    });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('puts the density of this visitor on the page, and follows a change — S-143', () => {
    useDensity.setState({ density: 'comfortable' });
    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(document.documentElement.dataset['density']).toBe('comfortable');
    act(() => {
      useDensity.getState().setDensity('compact');
    });
    expect(document.documentElement.dataset['density']).toBe('compact');
  });

  it('follows the operating system while the theme is the system’s — S-202', () => {
    let dark = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        get matches() {
          return dark;
        },
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      })),
    );
    useTheme.setState({ preference: 'system', theme: 'light' });
    const { unmount } = rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    act(() => {
      dark = true;
      for (const listener of [...listeners]) listener();
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    unmount();
    expect(listeners.size).toBe(0);
    vi.unstubAllGlobals();
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
    // The language is decided once, when the page loads: this is that moment, for this browser.
    useLocale.setState({ locale: initialLocale() });

    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(
      await screen.findByText(translator('pt-BR')('diagnostics.ping.title')),
    ).toBeInTheDocument();
    expect(currentLocale()).toBe('pt-BR');
  });

  it('falls back to English when the browser names no language at all', async () => {
    // Some embedded browsers expose no `navigator.languages`; the screen still has to speak one.
    setLocale('pt-BR');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(
      undefined as unknown as readonly string[],
    );
    useLocale.setState({ locale: initialLocale() });

    rtlRender(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(await screen.findByText(translator('en')('diagnostics.ping.title'))).toBeInTheDocument();
    expect(currentLocale()).toBe('en');
  });
});
