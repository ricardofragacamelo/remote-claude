import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { wsClient } from '@/shared/api/ws';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import { translator } from '../../../support/render';
import { draftOnScreen, openWorkbench, tabNamed } from '../../../support/workbench';
import { aTab, aTabServer, projects, refusal } from '../../../support/workspace-api';

const t = translator('en');
const A = `${projects.path}/a`;
const B = `${projects.path}/b`;

afterEach(() => {
  vi.restoreAllMocks();
  wsClient.close();
});

/** The workbench of A, over two tabs, with its folder resolved and on screen. */
async function on() {
  const mounted = openWorkbench(A, aTabServer([aTab(A), aTab(B)]));
  await draftOnScreen();
  await tabNamed('b');
  return mounted;
}

/** A press on the page — nothing focused, as after a click on the editor. */
function press(init: KeyboardEventInit): void {
  act(() => {
    fireEvent.keyDown(document.body, init);
  });
}

function helpSheet(): Promise<HTMLElement> {
  return screen.findByRole('dialog', {
    name: t('help.panel.title', { screen: t('workbench.screen.title') }),
  });
}

describe('the help of the workbench — plan 06, B-34', () => {
  it('opens from its button, with the four parts and the shortcuts of the registry', async () => {
    await on();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: t('help.panel.open') }));

    const sheet = await helpSheet();
    expect(within(sheet).getByText(t('workbench.help.what'))).toBeVisible();
    expect(within(sheet).getByText(t('workbench.help.states'))).toBeVisible();
    expect(within(sheet).getByText(t('workbench.help.notRecorded'))).toBeVisible();
    const shortcuts = within(sheet).getByRole('region', { name: t('help.section.shortcuts') });
    expect(within(shortcuts).getByText('Ctrl+B')).toBeVisible();
    expect(within(shortcuts).getByText(t('command.workbench.toggleSideBar'))).toBeVisible();
  });

  it('opens on Shift+F1 in the workbench too', async () => {
    await on();

    press({ key: 'F1', code: 'F1', shiftKey: true });

    expect(await helpSheet()).toBeVisible();
  });

  it('does not cover the tab because the help was left open on another screen', async () => {
    localStorage.setItem(`${VISITOR_PREFIX}help.open`, 'true');
    await on();

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes, and opens again on the next request', async () => {
    await on();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('help.panel.open') }));
    const sheet = await helpSheet();

    await user.click(within(sheet).getByRole('button', { name: t('help.panel.close') }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: t('help.panel.open') }));
    expect(await helpSheet()).toBeVisible();
  });

  it('runs every shortcut it lists — S-154', async () => {
    const mounted = await on();
    const sideBar = screen.getByRole('button', { name: t('workbench.layout.sideBar') });
    const panel = screen.getByRole('button', { name: t('workbench.layout.panel') });
    const sideBarWas = sideBar.getAttribute('aria-pressed');
    const panelWas = panel.getAttribute('aria-pressed');

    press({ key: 'b', code: 'KeyB', ctrlKey: true });
    await waitFor(() => {
      expect(sideBar.getAttribute('aria-pressed')).not.toBe(sideBarWas);
    });

    press({ key: 'j', code: 'KeyJ', ctrlKey: true });
    await waitFor(() => {
      expect(panel.getAttribute('aria-pressed')).not.toBe(panelWas);
    });

    press({ key: 'PageDown', code: 'PageDown', ctrlKey: true, altKey: true });
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: B });
    });

    press({ key: 'PageUp', code: 'PageUp', ctrlKey: true, altKey: true });
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: A });
    });

    press({ key: 'o', code: 'KeyO', ctrlKey: true });
    expect(await screen.findByRole('dialog', { name: t('workspace.dialog.title') })).toBeVisible();
    press({ key: 'Escape', code: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    press({ key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole('dialog', { name: t('palette.dialog.title') })).toBeVisible();
  });

  it('opens at the part about the ceiling of tabs, from the refusal — S-153', async () => {
    openWorkbench(A, aTabServer([]), {
      openFolders: [],
      open: () =>
        refusal('OPEN_FOLDERS_LIMIT_REACHED', 'workspace.error.openFoldersLimitReached', {
          limit: 8,
        }),
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: t('help.learnMore.label', { topic: t('help.topic.tabLimit') }),
      }),
    );

    const sheet = await helpSheet();
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(sheet).getByRole('region', { name: t('help.section.states') }),
      );
    });
  });
});
