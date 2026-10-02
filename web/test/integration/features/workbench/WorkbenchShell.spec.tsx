import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { panelTabs, statusBarItems, workbenchViews } from '@/features/workbench';
import type { FolderViewProps, StatusItemProps } from '@/features/workbench';
import { wsClient } from '@/shared/api/ws';
import { useLocale } from '@/shared/hooks/useLocale';
import { useTheme } from '@/shared/hooks/useTheme';
import { installFakeWebSocket } from '../../../support/fake-websocket';
import { translator } from '../../../support/render';
import { aViewport } from '../../../support/viewport';
import { draftOnScreen, openWorkbench, tabNamed } from '../../../support/workbench';
import { aTab, aTabServer, projects } from '../../../support/workspace-api';

const t = translator('en');
const A = `${projects.path}/a`;
const B = `${projects.path}/b`;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  wsClient.close();
});

/** The workbench of A, with its folder resolved and on screen. */
async function onA() {
  const mounted = openWorkbench(A, aTabServer([aTab(A), aTab(B)]));
  await draftOnScreen();
  return mounted;
}

function sideBar(key: string): HTMLElement | null {
  return screen.queryByRole('complementary', { name: t(key) });
}

function view(key: string): HTMLElement {
  return within(screen.getByRole('toolbar', { name: t('workbench.activityBar.label') })).getByRole(
    'button',
    { name: t(key) },
  );
}

describe('the anatomy of the workbench from md up — plan 06, S-116', () => {
  it('shows the files, the editor and the chat with Claude side by side, in the same tab', async () => {
    await onA();

    expect(sideBar('workbench.explorer.label')).toBeVisible();
    expect(screen.getByRole('region', { name: t('workbench.editor.label') })).toBeVisible();
    const claude = sideBar('workbench.claude.label')!;
    expect(within(claude).getByRole('group', { name: t('sessions.draft.choices') })).toBeVisible();
    // Held places say what will live there, never a blank.
    expect(screen.getByText(t('workbench.explorer.placeholder'))).toBeVisible();
    expect(screen.getByText(t('workbench.editor.placeholderTitle'))).toBeVisible();
  });

  it('has no accessibility violation', async () => {
    const { container } = await onA();

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('the activity bar — plan 06, S-111, S-112', () => {
  it('switches the view of the side bar, and pressing the one open closes it', async () => {
    const user = userEvent.setup();
    await onA();

    expect(view('workbench.explorer.label')).toHaveAttribute('aria-pressed', 'true');
    await user.click(view('workbench.search.label'));
    expect(sideBar('workbench.search.label')).toBeVisible();
    expect(screen.getByText(t('workbench.search.placeholder'))).toBeVisible();
    expect(view('workbench.search.label')).toHaveAttribute('aria-pressed', 'true');

    await user.click(view('workbench.search.label'));
    expect(sideBar('workbench.search.label')).toBeNull();
    expect(view('workbench.search.label')).toHaveAttribute('aria-pressed', 'false');

    await user.click(view('workbench.sessions.label'));
    expect(screen.getByText(t('workbench.sessions.placeholder'))).toBeVisible();
  });

  it('shows the component a later plan registers, in the place it declared', async () => {
    const Explorer = ({ folder }: FolderViewProps): React.JSX.Element => <p>{folder}</p>;
    const [held] = workbenchViews.entries();
    const remove = workbenchViews.register({ ...held!, placeholder: false, component: Explorer });

    try {
      await onA();
      expect(within(sideBar('workbench.explorer.label')!).getByText(A)).toBeVisible();
    } finally {
      remove();
    }
  });
});

describe('the side bar and the panel, opened and closed', () => {
  it('toggles the side bar and the bottom panel of the tab from the top of the workbench', async () => {
    const user = userEvent.setup();
    await onA();

    await user.click(screen.getByRole('button', { name: t('workbench.layout.sideBar') }));
    expect(sideBar('workbench.explorer.label')).toBeNull();

    await user.click(screen.getByRole('button', { name: t('workbench.layout.panel') }));
    expect(screen.getByRole('region', { name: t('workbench.panel.label') })).toBeVisible();
    expect(screen.getByText(t('workbench.panel.placeholderTitle'))).toBeVisible();

    await user.click(screen.getByRole('button', { name: t('workbench.layout.sideBar') }));
    expect(sideBar('workbench.explorer.label')).toBeVisible();
  });

  it('shows the tabs later plans register in the panel', async () => {
    const Terminal = ({ folder }: FolderViewProps): React.JSX.Element => <p>{folder}</p>;
    const remove = panelTabs.register({
      id: 'terminal',
      position: 100,
      labelKey: 'workbench.mobile.panel',
      component: Terminal,
    });
    const user = userEvent.setup();

    try {
      await onA();
      await user.click(screen.getByRole('button', { name: t('workbench.layout.panel') }));
      expect(screen.getByRole('tab', { name: t('workbench.mobile.panel') })).toBeVisible();
      expect(
        within(screen.getByRole('region', { name: t('workbench.panel.label') })).getByText(A),
      ).toBeVisible();
    } finally {
      remove();
    }
  });
});

describe('a tab left and come back to — plan 06, S-99, S-100, S-108', () => {
  it('keeps each tab’s view to itself, and loses nothing going A → B → A', async () => {
    const user = userEvent.setup();
    const mounted = await onA();
    await user.click(view('workbench.search.label'));
    await user.click(screen.getByRole('button', { name: t('workbench.layout.panel') }));

    await user.click(await tabNamed('b'));
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: B });
    });
    // B is a tab of its own: the view of A did not leak into it, and A's tree is gone.
    expect(await screen.findByText(t('workbench.explorer.placeholder'))).toBeVisible();
    expect(screen.queryByText(t('workbench.search.placeholder'))).toBeNull();
    expect(screen.queryByRole('region', { name: t('workbench.panel.label') })).toBeNull();

    await user.click(await tabNamed('a'));
    expect(await screen.findByText(t('workbench.search.placeholder'))).toBeVisible();
    expect(screen.getByRole('region', { name: t('workbench.panel.label') })).toBeVisible();
  });
});

describe('the status bar — plan 06, S-114', () => {
  function statusBar(): HTMLElement {
    return screen.getByRole('contentinfo', { name: t('status.bar.label') });
  }

  it('shows the folder, and copies its path on a press', async () => {
    const user = userEvent.setup();
    await onA();

    await user.click(
      within(statusBar()).getByRole('button', { name: t('status.folder.label', { path: A }) }),
    );

    expect(await navigator.clipboard.readText()).toBe(A);
  });

  it('shows the connection — and says so when the socket drops, and when it is back', async () => {
    const sockets = installFakeWebSocket();
    await onA();
    const bar = statusBar();

    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive({
        v: 1,
        id: 'srv-0',
        kind: 'ack',
        type: 'connection.ready',
        ts: '2026-09-30T12:00:00.000Z',
        payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
      });
    });
    expect(within(bar).getByText(t('connection.status.ready'))).toBeVisible();

    act(() => {
      sockets.latest.close(1006, 'gone');
    });
    expect(within(bar).getByText(t('connection.status.reconnecting'))).toBeVisible();
  });

  it('switches the language of the whole interface, and keeps the choice', async () => {
    const user = userEvent.setup();
    await onA();

    await user.click(
      within(statusBar()).getByRole('button', {
        name: t('status.language.pick', { language: t('status.language.en') }),
      }),
    );
    await user.click(await screen.findByRole('menuitemradio', { name: t('status.language.ptBR') }));

    expect(useLocale.getState().locale).toBe('pt-BR');
  });

  it('switches the theme', async () => {
    const user = userEvent.setup();
    await onA();

    await user.click(within(statusBar()).getByRole('button', { name: t('status.theme.toDark') }));

    expect(useTheme.getState().theme).toBe('dark');
    expect(
      within(statusBar()).getByRole('button', { name: t('status.theme.toLight') }),
    ).toBeVisible();
  });

  it('shows the items a later plan registers, on the side they declared', async () => {
    const Bell = ({ tab }: StatusItemProps): React.JSX.Element => (
      <span title="bell">{tab.name}</span>
    );
    const remove = statusBarItems.register({
      id: 'bell',
      side: 'right',
      position: 400,
      component: Bell,
    });

    try {
      await onA();
      expect(within(statusBar()).getByTitle('bell')).toHaveTextContent('a');
    } finally {
      remove();
    }
  });

  it('says when the folder of the tab is no longer allowed', async () => {
    const gone = `${projects.path}/gone`;
    openWorkbench(gone, aTabServer([{ path: gone, rootLabel: null, state: 'notAllowed' }]));

    expect(
      await within(await screen.findByRole('contentinfo')).findByText(
        t('status.folderState.notAllowed'),
      ),
    ).toBeVisible();
  });
});

describe('the workbench under md — plan 06, S-117, S-118', () => {
  it('shows one view at a time, switched from a bar at the bottom, in the same tab', async () => {
    aViewport('phone');
    const user = userEvent.setup();
    await onA();
    const bar = screen.getByRole('navigation', { name: t('workbench.mobile.label') });

    // Claude first — the one place with something in it until the Explorer arrives.
    expect(within(bar).getByRole('button', { name: t('workbench.mobile.claude') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(sideBar('workbench.explorer.label')).toBeNull();

    await user.click(within(bar).getByRole('button', { name: t('workbench.mobile.explorer') }));
    expect(sideBar('workbench.explorer.label')).toBeVisible();
    expect(screen.queryByRole('group', { name: t('sessions.draft.choices') })).toBeNull();
    await user.click(view('workbench.search.label'));
    await user.click(view('workbench.search.label'));
    expect(sideBar('workbench.search.label')).toBeVisible();

    await user.click(within(bar).getByRole('button', { name: t('workbench.mobile.editor') }));
    expect(screen.getByRole('region', { name: t('workbench.editor.label') })).toBeVisible();

    await user.click(within(bar).getByRole('button', { name: t('workbench.mobile.panel') }));
    expect(screen.getByRole('region', { name: t('workbench.panel.label') })).toBeVisible();

    expect(screen.queryByRole('toolbar', { name: t('workbench.activityBar.label') })).toBeNull();
  });

  it('loses nothing when the window changes width between the two layouts', async () => {
    const viewport = aViewport('desktop');
    const user = userEvent.setup();
    await onA();
    await user.click(view('workbench.search.label'));

    act(() => {
      viewport.phone();
    });
    const bar = await screen.findByRole('navigation', { name: t('workbench.mobile.label') });
    await user.click(within(bar).getByRole('button', { name: t('workbench.mobile.explorer') }));
    expect(sideBar('workbench.search.label')).toBeVisible();

    act(() => {
      viewport.desktop();
    });
    expect(
      await screen.findByRole('toolbar', { name: t('workbench.activityBar.label') }),
    ).toBeVisible();
    expect(sideBar('workbench.search.label')).toBeVisible();
    expect(screen.getByRole('navigation', { name: t('workbench.tabs.label') })).toBeVisible();
  });

  it('has no accessibility violation', async () => {
    aViewport('phone');
    const { container } = await onA();

    expect(await axe(container)).toHaveNoViolations();
  });
});
