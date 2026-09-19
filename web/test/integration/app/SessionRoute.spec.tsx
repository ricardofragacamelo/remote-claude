import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';

import { SessionRoute } from '@/app/SessionRoute';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { render, translator } from '../../support/render';
import { installFakeWebSocket } from '../../support/fake-websocket';

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

  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  return render(<RouterProvider router={router} />);
}

describe('the session route', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    setAccessToken('token-1');
    installFakeWebSocket();
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
});
