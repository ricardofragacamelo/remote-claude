import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { Callback } from '@/app/Callback';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { AppError } from '@/shared/api/errors';
import { navigation } from '@/shared/lib/navigation';
import { mountApp } from '../../support/app';
import { render, translator } from '../../support/render';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import { aTab, fakeWorkspaceApi, projects } from '../../support/workspace-api';

const t = translator('en');

const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

describe('the shell', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits rather than deciding, while the sign-in is still unknown', async () => {
    vi.spyOn(authService, 'renewSession').mockImplementation(() => new Promise(() => undefined));

    mountApp('/');

    // `findBy` and not `getBy`: the router resolves its first route asynchronously, so the shell
    // is mounted one tick after the render call rather than inside it.
    expect(await screen.findByLabelText(t('auth.callback.pending'))).toBeInTheDocument();
  });

  it('signs the visitor in from the refresh cookie when there is one', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    fakeWorkspaceApi({ roots: [projects], recent: [], openFolders: [] });

    mountApp('/');

    expect(
      await screen.findByRole('button', { name: t('workspace.welcome.openFolder') }),
    ).toBeVisible();
  });

  it('leads a signed-in visitor to the rules they granted, from the navigation', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    const user = userEvent.setup();
    const mounted = mountApp('/');

    await user.click(await screen.findByRole('link', { name: t('navigation.entry.rules') }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/rules');
    });
  });

  it('opens a recent folder in the workbench, the folder in the search — D-22', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    fakeWorkspaceApi({
      roots: [projects],
      openFolders: [],
      recent: [
        {
          path: '/srv/projects/app',
          rootLabel: 'Projects',
          lastOpenedAt: '2026-09-29T10:00:00.000Z',
          pinned: false,
          available: true,
        },
      ],
    });
    const user = userEvent.setup();
    const mounted = mountApp('/');

    await user.click(await screen.findByRole('button', { name: /^app/ }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/workbench');
    });
    expect(mounted.search()).toEqual({ folder: '/srv/projects/app' });
  });

  it('holds the welcome screen alone: no workspace selector, session starter, ping nor devices — S-149', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    fakeWorkspaceApi({ roots: [projects], recent: [], openFolders: [] });

    mountApp('/');

    expect(
      await screen.findByRole('button', { name: t('workspace.welcome.openFolder') }),
    ).toBeVisible();
    expect(screen.queryByRole('group', { name: t('sessions.draft.choices') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('diagnostics.ping.action') })).toBeNull();
    expect(screen.queryByText(t('devices.list.title'))).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('waits for the folder tabs before deciding, rather than showing the welcome screen first — S-05', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    fakeWorkspaceApi({ roots: [projects], recent: [] });

    mountApp('/');

    expect(await screen.findByLabelText(t('workspace.welcome.loading'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('workspace.welcome.openFolder') })).toBeNull();
  });

  it('leads / to the active folder tab when tabs are open, replacing the address — S-05', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    fakeWorkspaceApi({
      roots: [projects],
      recent: [],
      openFolders: [aTab('/srv/projects/a'), aTab('/srv/projects/b')],
    });
    localStorage.setItem(
      `${VISITOR_PREFIX}workbench.lastFolder`,
      JSON.stringify('/srv/projects/b'),
    );

    const mounted = mountApp('/');

    await waitFor(() => {
      expect(mounted.path()).toBe('/workbench');
    });
    expect(mounted.search()).toEqual({ folder: '/srv/projects/b' });
    expect(mounted.router.history.canGoBack()).toBe(false);
  });

  it('opens the welcome screen when the folder tabs could not be read — nobody is kept out', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    fakeWorkspaceApi({
      roots: [projects],
      recent: [],
      openFolders: new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 't'),
    });

    const mounted = mountApp('/');

    expect(
      await screen.findByRole('button', { name: t('workspace.welcome.openFolder') }),
    ).toBeVisible();
    expect(mounted.path()).toBe('/');
  });

  it('asks the visitor to sign in when there is no session to resume', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new AppError('X', 'k', 't'));

    mountApp('/');

    await waitFor(() => {
      expect(screen.getByText(t('auth.signIn.title'))).toBeInTheDocument();
    });
  });

  it('has no accessibility violation', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new AppError('X', 'k', 't'));
    const { container } = mountApp('/');

    await waitFor(() => {
      expect(screen.getByText(t('auth.signIn.title'))).toBeInTheDocument();
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});

// S-31
describe('the sign-out', () => {
  const END_SESSION = 'http://provider.test/realms/remote-claude/protocol/openid-connect/logout';

  let assign: ReturnType<typeof vi.spyOn>;
  let requests: string[];

  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    assign = vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);
    requests = [];

    // The provider and the backend both answer over `fetch`: the discovery document, and the
    // endpoint that drops the refresh cookie. Everything between the button and them is real.
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push(url);

      if (url.endsWith('/.well-known/openid-configuration')) {
        return Promise.resolve(
          Response.json({
            authorization_endpoint: 'http://a/b',
            end_session_endpoint: END_SESSION,
          }),
        );
      }

      return Promise.resolve(new Response(null, { status: 204 }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('drops the cookie, forgets the session and ends it at the provider too', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue({ ...session, idToken: 'id-1' });
    const user = userEvent.setup();
    mountApp('/');

    await user.click(await screen.findByRole('button', { name: t('navigation.account.label') }));
    await user.click(await screen.findByRole('menuitem', { name: t('auth.signOut.action') }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledTimes(1);
    });
    const target = new URL(String(assign.mock.calls[0]?.[0]));
    expect(`${target.origin}${target.pathname}`).toBe(END_SESSION);
    expect(target.searchParams.get('id_token_hint')).toBe('id-1');
    expect(target.searchParams.get('post_logout_redirect_uri')).toBe(`${window.location.origin}/`);
    expect(requests.some((url) => url.endsWith('/auth/logout'))).toBe(true);
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', session: null });
  });

  it('shows no sign-out to somebody who is not signed in', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new AppError('X', 'k', 't'));

    mountApp('/');

    expect(await screen.findByText(t('auth.signIn.title'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('navigation.account.label') })).toBeNull();
  });
});

describe('the callback', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(navigation, 'search').mockReturnValue('?code=c&state=s');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows that it is finishing while the exchange is in flight', () => {
    vi.spyOn(authService, 'completeLogin').mockImplementation(() => new Promise(() => undefined));

    render(<Callback />);

    expect(screen.getByLabelText(t('auth.callback.pending'))).toBeInTheDocument();
  });

  it('signs the visitor in and goes back to where they started', async () => {
    vi.spyOn(authService, 'completeLogin').mockResolvedValue(session);
    vi.spyOn(authService, 'returnRoute').mockReturnValue('/sessions/01J0');
    const replace = vi.spyOn(navigation, 'replace').mockImplementation(() => undefined);

    render(<Callback />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/sessions/01J0');
    });
    expect(useAuthStore.getState().session).toEqual(session);
  });

  it('shows the translated reason when the state did not match', async () => {
    vi.spyOn(authService, 'completeLogin').mockRejectedValue(
      new AppError('UNAUTHENTICATED', 'auth.error.invalidState', 'trace-1'),
    );

    render(<Callback />);

    await waitFor(() => {
      expect(screen.getByText(t('auth.error.invalidState'))).toBeInTheDocument();
    });
    expect(
      screen.getByText(t('common.error.traceLabel', { traceId: 'trace-1' })),
    ).toBeInTheDocument();
  });

  it('shows something a visitor can act on even for a failure it did not expect', async () => {
    vi.spyOn(authService, 'completeLogin').mockRejectedValue(new Error('boom'));

    render(<Callback />);

    await waitFor(() => {
      expect(screen.getByText(t('common.error.unexpected'))).toBeInTheDocument();
    });
  });

  it('signs nobody in and goes nowhere when it is left before the exchange answers', async () => {
    let answer: (value: typeof session) => void = () => undefined;
    vi.spyOn(authService, 'completeLogin').mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const replace = vi.spyOn(navigation, 'replace').mockImplementation(() => undefined);
    const signedIn = vi.spyOn(useAuthStore.getState(), 'signedIn');

    const { unmount } = render(<Callback />);
    unmount();

    await act(async () => {
      answer(session);
      await Promise.resolve();
    });

    // A page the visitor has already left does not get to move them, nor to sign them in behind
    // their back.
    expect(replace).not.toHaveBeenCalled();
    expect(signedIn).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ status: 'unknown', session: null });
  });

  it('keeps quiet about a failure that arrives after it was left', async () => {
    let fail: (reason: unknown) => void = () => undefined;
    vi.spyOn(authService, 'completeLogin').mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const replace = vi.spyOn(navigation, 'replace').mockImplementation(() => undefined);
    const errors = vi.spyOn(console, 'error');

    const { unmount } = render(<Callback />);
    unmount();

    await act(async () => {
      fail(new AppError('UNAUTHENTICATED', 'auth.error.invalidState', 'trace-1'));
      await Promise.resolve();
    });

    expect(screen.queryByText(t('auth.error.invalidState'))).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ status: 'unknown', session: null });
  });
});
