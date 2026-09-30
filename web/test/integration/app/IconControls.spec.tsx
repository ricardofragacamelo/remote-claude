import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { wsClient } from '@/shared/api/ws';
import { mountApp } from '../../support/app';
import { translator } from '../../support/render';
import { openWorkbench, tabNamed } from '../../support/workbench';
import { aTab, aTabServer, fakeWorkspaceApi, projects } from '../../support/workspace-api';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  wsClient.close();
});

/**
 * Every control on screen that shows no text: a button or a link that is only an icon. Each owes a
 * translated name to a screen reader **and** a tooltip to everyone else — the trigger of a tooltip
 * carries the state of it, which is how a control without one gives itself away.
 */
function iconOnly(): HTMLElement[] {
  return [...screen.getAllByRole('button'), ...screen.queryAllByRole('link')].filter(
    (control) => (control.textContent ?? '').trim() === '',
  );
}

function expectNamedWithTooltip(): void {
  const controls = iconOnly();

  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(control.getAttribute('aria-label') ?? '', control.outerHTML).not.toBe('');
    expect(control, control.outerHTML).toHaveAttribute('data-state');
  }
}

describe('every control that is only an icon, on the screens of plan 06 — S-151', () => {
  it.each([
    ['the welcome screen', '/', 'workspace.welcome.openFolder'],
    ['Devices', '/devices', 'devices.list.emptyTitle'],
    ['Logs and diagnostics', '/diagnostics', 'diagnostics.ping.action'],
    ['Settings · Appearance', '/settings/appearance', 'settings.appearance.theme'],
    ['Settings · Workspaces', '/settings/workspaces', 'workspace.recent.title'],
    ['About', '/about', 'about.project.title'],
  ])('has a name and a tooltip, on %s', async (_screen, href, landmark) => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    const workspace = fakeWorkspaceApi({
      roots: [projects],
      openFolders: [],
      recent: [
        {
          path: `${projects.path}/app`,
          rootLabel: 'Projects',
          lastOpenedAt: '2026-09-29T10:00:00.000Z',
          pinned: false,
          available: true,
        },
      ],
    });
    const listFolders = workspace.get.getMockImplementation();
    workspace.get.mockImplementation((path: string) =>
      path === '/devices'
        ? Promise.resolve({ devices: [] })
        : path === '/diag/versions'
          ? Promise.resolve({})
          : (listFolders?.(path) ?? new Promise(() => undefined)),
    );

    mountApp(href);

    await screen.findAllByText(t(landmark));
    expectNamedWithTooltip();
    expect(api.get).toHaveBeenCalled();
  });

  it('has a name and a tooltip, in the workbench', async () => {
    openWorkbench(`${projects.path}/a`, aTabServer([aTab(`${projects.path}/a`)]));
    await screen.findByRole('button', { name: t('session.starter.action') });
    await tabNamed('a');

    expectNamedWithTooltip();
  });
});
