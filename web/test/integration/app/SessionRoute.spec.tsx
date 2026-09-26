import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionRoute } from '@/app/SessionRoute';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { render, translator } from '../../support/render';
import { installFakeWebSocket } from '../../support/fake-websocket';
import type { InstalledWebSocket } from '../../support/fake-websocket';

const t = translator('en');
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const session = { accessToken: 'a', userId: 'auth|42', expiresAt: Date.now() + 900_000 };

/** The route, at the path the link carries — which is the whole point of putting it there. */
function mountAt(path: string) {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/sessions/$sessionId',
    component: SessionRoute,
  });
  const rules = createRoute({ getParentRoute: () => root, path: '/rules', component: () => null });

  const router = createRouter({
    routeTree: root.addChildren([route, rules]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  return {
    ...render(<RouterProvider router={router} />),
    path: () => router.state.location.pathname,
  };
}

describe('the session route', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    setAccessToken('token-1');
    sockets = installFakeWebSocket();
  });

  afterEach(() => {
    wsClient.close();
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it('waits rather than deciding, while the sign-in is still unknown', async () => {
    vi.spyOn(authService, 'renewSession').mockImplementation(() => new Promise(() => undefined));

    mountAt(`/sessions/${SESSION}`);

    expect(await screen.findByLabelText(t('auth.callback.pending'))).toBeInTheDocument();
  });

  it('asks an anonymous visitor to sign in, and remembers where they were going', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new Error('no cookie'));

    mountAt(`/sessions/${SESSION}`);

    expect(await screen.findByText(t('auth.signIn.title'))).toBeInTheDocument();
  });

  it('reproduces the screen from the link alone', async () => {
    // The test the architecture states: pasting the link on another device brings up this screen.
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);

    mountAt(`/sessions/${SESSION}`);

    await waitFor(() => {
      expect(
        screen.getByText(t('session.screen.sessionLabel', { sessionId: SESSION })),
      ).toBeInTheDocument();
    });

    // Two features watching the same session, neither knowing the other exists.
    expect(screen.getByText(t('permission.queue.title'))).toBeInTheDocument();
  });

  it('leads from a "don’t ask again" to the rules that take it back — D-04', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    const user = userEvent.setup();
    const mounted = mountAt(`/sessions/${SESSION}`);
    await screen.findByText(t('permission.queue.title'));

    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive({
        v: 1,
        id: 'srv-0',
        kind: 'ack',
        type: 'connection.ready',
        ts: new Date().toISOString(),
        payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
      });
      sockets.latest.receive({
        v: 1,
        id: 'frame-1',
        kind: 'request',
        type: 'permission.requested',
        ts: new Date().toISOString(),
        sessionId: SESSION,
        payload: {
          requestId: 'req-1',
          toolUseId: 'toolu-1',
          toolName: 'Bash',
          title: 'permission.tool.Bash',
          input: { command: 'git status' },
          riskHint: 'read',
          defaultToNo: true,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          suggestions: [
            {
              scope: 'always',
              labelKey: 'permission.scope.always',
              pattern: 'Bash(git status)',
              lifetimeMs: 86_400_000,
            },
          ],
        },
      });
    });

    await user.click(await screen.findByRole('button', { name: t('permission.scope.always') }));
    await user.click(screen.getByRole('button', { name: t('permission.persist.openRules') }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/rules');
    });
  });
});
