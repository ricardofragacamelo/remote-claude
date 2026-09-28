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
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ConversationRoute } from '@/app/ConversationRoute';
import { HistoryRoute, readHistorySearch } from '@/app/HistoryRoute';
import { SessionRoute } from '@/app/SessionRoute';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { useLiveSessionStore } from '@/features/session';
import { api } from '@/shared/api/api';
import { navigation } from '@/shared/lib/navigation';
import { aConversationDto, aHistoryPage, OURS, said } from '../../support/history';
import { aLiveSocket, hubEvent } from '../../support/live-socket';
import type { LiveSocket } from '../../support/live-socket';
import { render, translator } from '../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};
const LIVE = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

/** The history, the conversation and the session, reached by their links alone. */
function mountAt(url: string) {
  const root = createRootRoute({ component: Outlet });
  const history = createRoute({
    getParentRoute: () => root,
    path: '/history',
    validateSearch: readHistorySearch,
    component: HistoryRoute,
  });
  const conversation = createRoute({
    getParentRoute: () => root,
    path: '/history/$conversationId',
    component: ConversationRoute,
  });
  const live = createRoute({
    getParentRoute: () => root,
    path: '/sessions/$sessionId',
    component: SessionRoute,
  });
  const rules = createRoute({ getParentRoute: () => root, path: '/rules', component: () => null });
  const home = createRoute({ getParentRoute: () => root, path: '/', component: () => null });

  const router = createRouter({
    routeTree: root.addChildren([history, conversation, live, rules, home]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });

  return {
    ...render(<RouterProvider router={router} />),
    location: () => router.state.location,
  };
}

describe('the history routes — plan 04', () => {
  let socket: LiveSocket;

  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    useLiveSessionStore.getState().reset();
    socket = aLiveSocket();
  });

  afterEach(() => {
    socket.close();
    vi.restoreAllMocks();
  });

  it('lists the conversations of the workspace the link names, and opens one', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ sessions: [aConversationDto()], nextCursor: null });
    const mounted = mountAt('/history?workspacePath=%2Fsrv%2Fprojects%2Fapp');

    await userEvent.click(await screen.findByRole('button', { name: /Fix the flaky test/ }));

    expect(get).toHaveBeenCalledWith('/transcripts?workspacePath=%2Fsrv%2Fprojects%2Fapp');
    await waitFor(() => {
      expect(mounted.location().pathname).toBe(`/history/${OURS}`);
    });
  });

  it('says what to do when the link names no workspace', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    const get = vi.spyOn(api, 'get');
    mountAt('/history');

    expect(await screen.findByText(t('transcript.screen.noWorkspaceTitle'))).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('comes back to the same workspace after signing in', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new Error('no cookie'));
    const login = vi
      .spyOn(authService, 'beginLogin')
      .mockResolvedValue('https://provider.test/authorize');
    vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);

    mountAt('/history?workspacePath=%2Fsrv%2Fprojects%2Fapp');
    await userEvent.click(await screen.findByRole('button', { name: t('auth.signIn.action') }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('/history?workspacePath=%2Fsrv%2Fprojects%2Fapp');
    });
  });

  it('continues a conversation and lands on the session it became', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([said('m1', 'hi')]));
    const mounted = mountAt(`/history/${OURS}`);
    socket.connect();

    await userEvent.click(await screen.findByRole('button', { name: t('history.screen.resume') }));
    socket.receive(
      hubEvent(LIVE, 'session.started', 1, {
        sessionId: LIVE,
        claudeSessionId: OURS,
        resumedFrom: OURS,
      }),
    );

    await waitFor(() => {
      expect(mounted.location().pathname).toBe(`/sessions/${LIVE}`);
    });
  });

  it('leads from a live session to the whole of its conversation', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({ requests: [] });
    const mounted = mountAt(`/sessions/${LIVE}`);
    socket.connect();
    // Signed in and attached before the stream says anything: what arrives for a session nobody
    // watches yet goes to the observers, not to this screen.
    await screen.findByText(t('session.screen.emptyTitle'));

    socket.receive(
      hubEvent(LIVE, 'session.started', 1, { sessionId: LIVE, claudeSessionId: OURS }),
    );
    await userEvent.click(await screen.findByRole('button', { name: t('session.history.open') }));

    await waitFor(() => {
      expect(mounted.location().pathname).toBe(`/history/${OURS}`);
    });
  });

  it('has no accessibility violation', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({ sessions: [aConversationDto()], nextCursor: null });
    const { container } = mountAt('/history?workspacePath=%2Fsrv%2Fprojects%2Fapp');

    await screen.findByText('Fix the flaky test');

    expect(await axe(container)).toHaveNoViolations();
  });
});
