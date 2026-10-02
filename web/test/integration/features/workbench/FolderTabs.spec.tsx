import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusManager } from '@tanstack/react-query';
import { axe } from 'jest-axe';

import { workbenchLocation } from '@/app/workbench-location';
import { translator } from '../../../support/render';
import { aViewport } from '../../../support/viewport';
import {
  draftOnScreen,
  openWorkbench,
  strip,
  tabNamed,
  tabNames,
} from '../../../support/workbench';
import { aTab, aTabServer, projects, refusal } from '../../../support/workspace-api';

const t = translator('en');
const A = `${projects.path}/a`;
const B = `${projects.path}/b`;
const C = `${projects.path}/c`;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Opens a folder from the "+" of the strip, through the dialog, as a person does. */
async function openFromTheStrip(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: t('workbench.tabs.open') }));
  const dialog = await screen.findByRole('dialog', { name: t('workspace.dialog.title') });
  await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
  await user.click(await within(dialog).findByRole('option', { name }));
  await within(dialog).findByRole('option', { name: 'a' });
  await user.click(within(dialog).getByRole('button', { name: t('workspace.dialog.open') }));
}

describe('opening folder tabs — plan 06, S-96, S-97, S-98, S-103', () => {
  it('opens a second folder in a second tab, on screen, with the folder in the URL — S-96', async () => {
    const server = aTabServer([aTab(A)]);
    const user = userEvent.setup();
    const mounted = openWorkbench(A, server);
    await tabNamed('a');

    await openFromTheStrip(user, 'b');

    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: B });
    });
    expect(await tabNamed('b')).toHaveAttribute('aria-current', 'page');
    await waitFor(() => {
      expect(tabNames()).toEqual(['a', 'b']);
    });
    expect(server.paths()).toEqual([A, B]);
  });

  it('focuses the tab of a folder already open, and never opens a second one of it — S-97', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const user = userEvent.setup();
    const mounted = openWorkbench(B, server);
    await tabNamed('a');

    await openFromTheStrip(user, 'a');

    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: A });
    });
    expect(await tabNamed('a')).toHaveAttribute('aria-current', 'page');
    expect(tabNames()).toEqual(['a', 'b']);
  });

  it('keeps a folder and its subfolder as two tabs — S-98', async () => {
    const server = aTabServer([aTab(A), aTab(`${A}/a`)]);
    openWorkbench(A, server);

    await waitFor(() => {
      expect(tabNames()).toEqual(['a', 'a']);
    });
  });

  it('opens the folder a link names as a new tab, at the end — S-103', async () => {
    const server = aTabServer([aTab(A)]);
    const { api } = openWorkbench(C, server);

    expect(await tabNamed('c')).toHaveAttribute('aria-current', 'page');
    await waitFor(() => {
      expect(server.paths()).toEqual([A, C]);
    });
    expect(api.post).toHaveBeenCalledWith('/workspaces/open-folders', { path: C });
    expect(tabNames()).toEqual(['a', 'c']);
  });

  it('switches tabs from the strip, the folder in the URL', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const user = userEvent.setup();
    const mounted = openWorkbench(A, server);

    await user.click(await tabNamed('b'));

    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: B });
    });
  });
});

describe('a tab whose folder cannot be used — plan 06, S-104, S-105', () => {
  it('opens in its error state and leaves the other tabs working — S-104', async () => {
    const gone = `${projects.path}/gone`;
    const server = aTabServer([aTab(A), { path: gone, rootLabel: null, state: 'notAllowed' }]);
    const user = userEvent.setup();
    const mounted = openWorkbench(gone, server, {
      resolve: (path) =>
        path === gone
          ? refusal('WORKSPACE_NOT_ALLOWED', 'workspace.error.notAllowed', { path })
          : { path, root: projects },
    });

    expect(await screen.findByText(t('workspace.error.notAllowed', { path: gone }))).toBeVisible();
    expect(await tabNamed(new RegExp(t('workbench.tabState.notAllowed')))).toBeVisible();

    await user.click(await tabNamed('a'));

    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: A });
    });
    expect(await draftOnScreen()).toBeVisible();
  });

  it('says the ceiling of tabs, and that closing one does not end its sessions — S-105', async () => {
    const full = Array.from({ length: 8 }, (_, index) =>
      aTab(`${projects.path}/f${String(index)}`),
    );
    const server = aTabServer(full);
    openWorkbench(C, server, {
      open: () =>
        refusal('OPEN_FOLDERS_LIMIT_REACHED', 'workspace.error.openFoldersLimitReached', {
          limit: 8,
        }),
    });

    expect(
      await screen.findByText(t('workspace.error.openFoldersLimitReached', { limit: 8 })),
    ).toBeVisible();
    expect(t('workspace.error.openFoldersLimitReached', { limit: 8 })).toMatch(/8.*does not end/);
    expect(await tabNamed('c')).toHaveAttribute('aria-current', 'page');
  });
});

describe('closing folder tabs — plan 06, S-101, S-102, S-109', () => {
  async function closeTab(user: ReturnType<typeof userEvent.setup>, name: string) {
    await tabNamed(name);
    await user.click(
      within(strip()).getByRole('button', { name: t('workbench.tabs.close', { name }) }),
    );
    return screen.findByRole('dialog', { name: t('workbench.close.titleOne', { name }) });
  }

  it('asks first, says the sessions carry on, and ends none of them — S-101', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const user = userEvent.setup();
    const { api } = openWorkbench(A, server);

    const dialog = await closeTab(user, 'b');

    expect(within(dialog).getByText(t('workbench.close.sessionsCarryOn'))).toBeVisible();
    // The way out has the focus, not the closing.
    expect(within(dialog).getByRole('button', { name: t('workbench.close.keep') })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: t('workbench.close.confirm') }));

    await waitFor(() => {
      expect(tabNames()).toEqual(['a']);
    });
    expect(api.remove).toHaveBeenCalledWith(
      `/workspaces/open-folders?path=${encodeURIComponent(B)}`,
    );
  });

  it('keeps the tab on "keep open"', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const user = userEvent.setup();
    openWorkbench(A, server);

    const dialog = await closeTab(user, 'b');
    await user.click(within(dialog).getByRole('button', { name: t('workbench.close.keep') }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(server.paths()).toEqual([A, B]);
  });

  it('keeps the tab on Esc, and does not dismiss the question on a click outside it', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const user = userEvent.setup();
    openWorkbench(A, server);

    const dialog = await closeTab(user, 'b');
    fireEvent.pointerDown(document.body);
    expect(dialog).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(server.paths()).toEqual([A, B]);
  });

  it('puts the right neighbour on screen when the active tab closes — S-102', async () => {
    const server = aTabServer([aTab(A), aTab(B), aTab(C)]);
    const user = userEvent.setup();
    const mounted = openWorkbench(B, server);

    const dialog = await closeTab(user, 'b');
    await user.click(within(dialog).getByRole('button', { name: t('workbench.close.confirm') }));

    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: C });
    });
  });

  it('goes back to the welcome screen when the last tab closes — S-102', async () => {
    const server = aTabServer([aTab(A)]);
    const user = userEvent.setup();
    const mounted = openWorkbench(A, server);

    const dialog = await closeTab(user, 'a');
    await user.click(within(dialog).getByRole('button', { name: t('workbench.close.confirm') }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/');
    });
    expect(
      await screen.findByRole('button', { name: t('workspace.welcome.openFolder') }),
    ).toBeVisible();
  });

  it('closes one tab for a double click on "close", and one for a double click on the confirmation — S-109', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const user = userEvent.setup();
    const { api } = openWorkbench(A, server);

    await tabNamed('b');
    await user.dblClick(
      within(strip()).getByRole('button', { name: t('workbench.tabs.close', { name: 'b' }) }),
    );
    const dialogs = await screen.findAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    await user.dblClick(
      within(dialogs[0]!).getByRole('button', { name: t('workbench.close.confirm') }),
    );

    await waitFor(() => {
      expect(tabNames()).toEqual(['a']);
    });
    expect(api.remove).toHaveBeenCalledTimes(1);
  });

  it('closes the others, or the ones to the right, from the menu of a tab, with one confirmation', async () => {
    const server = aTabServer([aTab(A), aTab(B), aTab(C)]);
    const user = userEvent.setup();
    openWorkbench(A, server);

    fireEvent.contextMenu(await tabNamed('a'));
    await user.click(
      await screen.findByRole('menuitem', { name: t('workbench.tabAction.closeRight') }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: t('workbench.close.titleMany', { count: 2 }),
    });
    expect(
      within(dialog).getByRole('list', { name: t('workbench.close.listLabel') }),
    ).toHaveTextContent(B);
    await user.click(within(dialog).getByRole('button', { name: t('workbench.close.confirm') }));

    await waitFor(() => {
      expect(tabNames()).toEqual(['a']);
    });
  });
});

describe('moving folder tabs — plan 06, S-106', () => {
  it('moves by dragging', async () => {
    const server = aTabServer([aTab(A), aTab(B), aTab(C)]);
    openWorkbench(A, server);
    const from = await tabNamed('c');
    const to = await tabNamed('a');
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };

    fireEvent.dragStart(from, { dataTransfer });
    fireEvent.dragOver(to, { dataTransfer });
    fireEvent.drop(to, { dataTransfer });

    await waitFor(() => {
      expect(tabNames()).toEqual(['c', 'a', 'b']);
    });
  });

  it('moves from the keyboard, Alt+Shift and an arrow on the tab', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const user = userEvent.setup();
    openWorkbench(A, server);

    (await tabNamed('a')).focus();
    await user.keyboard('{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}');

    await waitFor(() => {
      expect(tabNames()).toEqual(['b', 'a']);
    });
  });

  it('moves from the menu of a tab, and the order survives a reload', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const user = userEvent.setup();
    const first = openWorkbench(A, server);

    fireEvent.contextMenu(await tabNamed('b'));
    await user.click(
      await screen.findByRole('menuitem', { name: t('workbench.tabAction.moveLeft') }),
    );
    await waitFor(() => {
      expect(tabNames()).toEqual(['b', 'a']);
    });

    first.unmount();
    vi.restoreAllMocks();
    openWorkbench(A, server);
    await waitFor(() => {
      expect(tabNames()).toEqual(['b', 'a']);
    });
  });

  it('says so when another window changed the tabs first, and shows them as they are', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const user = userEvent.setup();
    openWorkbench(A, server, {
      order: () => refusal('CONFLICT', 'workspace.error.openFoldersOrderConflict'),
    });

    (await tabNamed('a')).focus();
    await user.keyboard('{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}');

    expect(await screen.findByText(t('workspace.error.openFoldersOrderConflict'))).toBeVisible();
    expect(tabNames()).toEqual(['a', 'b']);
  });
});

describe('two windows on the same tabs — plan 06, S-107', () => {
  it('converge on the server’s set when the window comes back', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    openWorkbench(A, server);
    await waitFor(() => {
      expect(tabNames()).toEqual(['a', 'b']);
    });

    // Another window closes one, and opens another.
    await server.routes.close?.(B);
    await server.routes.open?.(C);
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => {
      expect(tabNames()).toEqual(['a', 'c']);
    });
    focusManager.setFocused(undefined);
  });
});

describe('copying the path of a tab', () => {
  it('copies it from the menu, and says it did', async () => {
    const server = aTabServer([aTab(A)]);
    // After the user is set up: it puts a clipboard of its own on the navigator.
    const user = userEvent.setup();
    openWorkbench(A, server);

    fireEvent.contextMenu(await tabNamed('a'));
    await user.click(
      await screen.findByRole('menuitem', { name: t('workbench.tabAction.copyPath') }),
    );

    expect(await screen.findByText(t('workbench.tabCopy.copied'))).toBeVisible();
    expect(await navigator.clipboard.readText()).toBe(A);
  });
});

describe('the tabs under md — plan 06, S-110', () => {
  it('become a selector at the top with the same tabs and the same actions', async () => {
    aViewport('phone');
    const server = aTabServer([aTab(A), aTab(B)]);
    const user = userEvent.setup();
    const mounted = openWorkbench(A, server);

    await user.click(
      await screen.findByRole('button', { name: t('workbench.tabs.pick', { name: 'a' }) }),
    );
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: 'a' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    for (const key of ['close', 'closeOthers', 'closeRight', 'moveLeft', 'moveRight', 'copyPath']) {
      expect(
        within(menu).getByRole('menuitem', { name: t(`workbench.tabAction.${key}`) }),
      ).toBeInTheDocument();
    }

    await user.click(within(menu).getByRole('menuitemradio', { name: 'b' }));

    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: B });
    });
  });
});

describe('the strip of tabs', () => {
  it('has no accessibility violation', async () => {
    const server = aTabServer([aTab(A), aTab(B)]);
    const { container } = openWorkbench(A, server);
    await draftOnScreen();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('keeps an address typed by hand working, with no tab open yet', async () => {
    const server = aTabServer([]);
    const mounted = openWorkbench(A, server);

    expect(await tabNamed('a')).toBeVisible();
    expect(mounted.router.state.location.href).toBe(workbenchLocation({ folder: A }));
  });
});
