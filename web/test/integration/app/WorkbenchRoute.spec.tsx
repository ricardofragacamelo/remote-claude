import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { axe } from 'jest-axe';

import { routeTree } from '@/app/router';
import { workbenchLocation } from '@/app/workbench-location';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { installFakeWebSocket } from '../../support/fake-websocket';
import type { InstalledWebSocket } from '../../support/fake-websocket';
import { render, translator } from '../../support/render';
import { fakeWorkspaceApi, projects, refusal, scratch } from '../../support/workspace-api';
import type { WorkspaceRoutes } from '../../support/workspace-api';

const t = translator('en');
const APP = `${projects.path}/app`;
const tab = { path: APP, rootLabel: 'Projects', state: 'available' as const };

const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

const readyFrame = {
  v: 1,
  id: 'srv-0',
  kind: 'ack',
  type: 'connection.ready',
  ts: '2026-09-29T12:00:00.000Z',
  payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
};

/** Every folder under a root resolves to itself; the rest is the test's to say. */
const resolving: WorkspaceRoutes = {
  roots: [scratch, projects],
  recent: [],
  openFolders: [],
  resolve: (path) => ({ path, root: projects }),
  open: () => tab,
};

/** The tab of a folder, on screen — the one the address names. */
function activeTab(name: string): Promise<HTMLElement> {
  return screen.findByRole('button', { name, current: 'page' });
}

/** The real table of routes, on a memory history, signed in. */
function mountAt(href: string, routes: WorkspaceRoutes = resolving) {
  const api = fakeWorkspaceApi(routes);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [href] }),
  });
  const mounted = render(<RouterProvider router={router} />);
  return { ...mounted, api, router };
}

describe('the workbench of one folder — B-16', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    setAccessToken('token-1');
    sockets = installFakeWebSocket();
  });

  afterEach(() => {
    wsClient.close();
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  function connect(): void {
    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive(readyFrame);
    });
  }

  it('opens the folder of the URL, and records it as open', async () => {
    const { api } = mountAt(workbenchLocation({ folder: APP }));

    expect(await activeTab('app')).toBeVisible();
    // The path is the status bar's to show, and a press on it copies it.
    expect(
      screen.getByRole('button', { name: t('status.folder.label', { path: APP }) }),
    ).toBeVisible();
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/workspaces/open-folders', { path: APP });
    });
  });

  it('replaces a link to a symlink by the real folder — S-78', async () => {
    const { router, api } = mountAt(workbenchLocation({ folder: `${projects.path}/link` }), {
      ...resolving,
      resolve: () => ({ path: APP, root: projects }),
    });

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ folder: APP });
    });
    expect(await activeTab('app')).toBeVisible();
    // Replaced, not pushed: going back does not return to the link.
    expect(router.history.length).toBe(1);
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/workspaces/open-folders', { path: APP });
    });
    expect(api.post.mock.calls.every(([, body]) => (body as { path: string }).path === APP)).toBe(
      true,
    );
  });

  it('starts the session in the folder of the URL — never the first root — S-82', async () => {
    const user = userEvent.setup();
    mountAt(workbenchLocation({ folder: APP }));
    await activeTab('app');
    connect();

    await user.click(await screen.findByRole('button', { name: t('session.starter.action') }));

    const start = sockets.latest.frames().find((frame) => frame['type'] === 'session.start');
    expect(start).toMatchObject({ payload: { workspacePath: APP } });
    expect(start).not.toMatchObject({ payload: { workspacePath: scratch.path } });
  });

  it('reopens the same folder on a reload, asking to record it once per load — S-83', async () => {
    const first = mountAt(workbenchLocation({ folder: APP }));
    await waitFor(() => {
      expect(first.api.post).toHaveBeenCalledTimes(1);
    });
    first.unmount();
    vi.restoreAllMocks();
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);

    const second = mountAt(workbenchLocation({ folder: APP }));

    expect(await activeTab('app')).toBeVisible();
    await waitFor(() => {
      expect(second.api.post).toHaveBeenCalledTimes(1);
    });
    expect(second.api.post).toHaveBeenCalledWith('/workspaces/open-folders', { path: APP });
  });

  it.each([
    ['outside the allowlist', 'WORKSPACE_NOT_ALLOWED', 'workspace.error.notAllowed'],
    ['that does not exist', 'WORKSPACE_NOT_FOUND', 'workspace.error.notFound'],
    ['that is a file', 'WORKSPACE_NOT_A_DIRECTORY', 'workspace.error.notADirectory'],
  ])('refuses a folder %s, translated, with the way back — S-79…S-81', async (_case, code, key) => {
    const user = userEvent.setup();
    const { router, api } = mountAt(workbenchLocation({ folder: '/etc' }), {
      ...resolving,
      resolve: () => refusal(code, key, { path: '/etc' }),
    });

    expect(await screen.findByText(t(key, { path: '/etc' }))).toBeVisible();
    expect(screen.queryByRole('button', { name: t('session.starter.action') })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: t('workspace.folder.openOther') }));
    expect(await screen.findByRole('dialog', { name: t('workspace.dialog.title') })).toBeVisible();
    await user.keyboard('{Escape}');

    await user.click(
      within(screen.getByRole('main')).getAllByRole('button', {
        name: t('workspace.folder.backToWelcome'),
      })[0]!,
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('opens another folder from the refusal, straight into the workbench', async () => {
    const user = userEvent.setup();
    const { router } = mountAt(workbenchLocation({ folder: '/etc' }), {
      ...resolving,
      resolve: (path) =>
        path === '/etc'
          ? refusal('WORKSPACE_NOT_ALLOWED', 'workspace.error.notAllowed')
          : { path, root: projects },
      directories: () => ({
        path: projects.path,
        root: projects,
        parent: null,
        entries: [],
        truncated: false,
      }),
    });

    await user.click(await screen.findByRole('button', { name: t('workspace.folder.openOther') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await within(dialog).findByText(t('workspace.dialog.emptyTitle'));
    await user.click(within(dialog).getByRole('button', { name: t('workspace.dialog.open') }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ folder: projects.path });
    });
    expect(await activeTab('projects')).toBeVisible();
  });

  it('keeps the folder open when it could not be kept among the tabs, and says why — S-183', async () => {
    mountAt(workbenchLocation({ folder: APP }), {
      ...resolving,
      open: () =>
        refusal('OPEN_FOLDERS_LIMIT_REACHED', 'workspace.error.openFoldersLimitReached', {
          limit: 8,
        }),
    });

    const notice = (await screen.findByText(t('workspace.folder.notKept'))).closest(
      '[role="status"]',
    );
    expect(notice).toHaveTextContent(t('workspace.error.openFoldersLimitReached', { limit: 8 }));
    expect(await activeTab('app')).toBeVisible();
    expect(screen.getByRole('button', { name: t('session.starter.action') })).toBeInTheDocument();
  });

  it('holds the place of the folder while it is being resolved', async () => {
    mountAt(workbenchLocation({ folder: APP }), {
      ...resolving,
      resolve: () => () => new Promise(() => undefined),
    });

    expect(await screen.findByLabelText(t('workspace.folder.loading'))).toBeVisible();
  });

  it('sends an address with no folder to the welcome screen — S-03', async () => {
    const { router } = mountAt('/workbench');

    expect(
      await screen.findByRole('button', { name: t('workspace.welcome.openFolder') }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
  });

  it('has no accessibility violation', async () => {
    const { container } = mountAt(workbenchLocation({ folder: APP }));
    await activeTab('app');

    expect(await axe(container)).toHaveNoViolations();
  });
});
