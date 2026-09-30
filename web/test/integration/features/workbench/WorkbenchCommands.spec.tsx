import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { releaseFolderTabs } from '@/features/workbench/store/folder-tab.store';
import { wsClient } from '@/shared/api/ws';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import { translator } from '../../../support/render';
import { openWorkbench, tabNamed } from '../../../support/workbench';
import { aTab, aTabServer, projects } from '../../../support/workspace-api';

const t = translator('en');
const A = `${projects.path}/a`;
const B = `${projects.path}/b`;
const C = `${projects.path}/c`;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  wsClient.close();
});

/** The workbench of `folder`, over three tabs, with its folder resolved and on screen. */
async function on(folder = A) {
  const mounted = openWorkbench(folder, aTabServer([aTab(A), aTab(B), aTab(C)]));
  await screen.findByRole('button', { name: t('session.starter.action') });
  await tabNamed('c');
  return mounted;
}

/** A press on the page — nothing focused, as after a click on the editor. */
function press(init: KeyboardEventInit): void {
  act(() => {
    fireEvent.keyDown(document.body, init);
  });
}

function view(key: string): HTMLElement {
  return within(screen.getByRole('toolbar', { name: t('workbench.activityBar.label') })).getByRole(
    'button',
    { name: t(key) },
  );
}

describe('switching folder tabs from the keyboard — plan 06, S-122, D-16', () => {
  it('goes to a tab by its place with Alt+1…9', async () => {
    const mounted = await on();

    press({ key: '2', code: 'Digit2', altKey: true });
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: B });
    });

    press({ key: '3', code: 'Digit3', altKey: true });
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: C });
    });
  });

  it('does nothing for a place with no tab — the key is left to the browser', async () => {
    const mounted = await on();
    const event = new KeyboardEvent('keydown', {
      key: '9',
      code: 'Digit9',
      altKey: true,
      cancelable: true,
      bubbles: true,
    });

    act(() => {
      document.body.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(mounted.search()).toEqual({ folder: A });
  });

  it('goes to the next and the previous with Ctrl+Alt+PageDown/PageUp, round at the ends', async () => {
    const mounted = await on(C);

    press({ key: 'PageDown', code: 'PageDown', ctrlKey: true, altKey: true });
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: A });
    });

    press({ key: 'PageUp', code: 'PageUp', ctrlKey: true, altKey: true });
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: C });
    });
  });

  it('is Cmd+Alt+←/→ on a Mac', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const mounted = await on();

    press({ key: 'ArrowRight', code: 'ArrowRight', metaKey: true, altKey: true });
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: B });
    });
  });

  it('binds nothing to the keys the browser keeps: Ctrl+Tab stays the browser’s', async () => {
    const mounted = await on();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      code: 'Tab',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });

    act(() => {
      document.body.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(mounted.search()).toEqual({ folder: A });
  });
});

describe('the layout of the tab from the keyboard — plan 06, B-23', () => {
  it('opens and closes the side bar with Ctrl+B and the panel with Ctrl+J, and says so on the buttons', async () => {
    await on();
    const sideBar = screen.getByRole('button', { name: t('workbench.layout.sideBar') });

    expect(sideBar).toHaveAttribute('aria-keyshortcuts', 'Control+B');
    press({ key: 'b', code: 'KeyB', ctrlKey: true });
    await waitFor(() => {
      expect(sideBar).toHaveAttribute('aria-pressed', 'false');
    });

    press({ key: 'j', code: 'KeyJ', ctrlKey: true });
    expect(await screen.findByRole('region', { name: t('workbench.panel.label') })).toBeVisible();
  });
});

describe('closing a folder tab from the palette — plan 06, S-123, D-16', () => {
  it('asks first, like the × of the tab, and says the sessions carry on', async () => {
    const user = userEvent.setup();
    await on();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(await screen.findByRole('combobox'), ' close folder{Enter}');

    const question = await screen.findByRole('dialog', {
      name: t('workbench.close.titleOne', { name: 'a' }),
    });
    expect(question).toHaveTextContent(t('workbench.close.sessionsCarryOn'));
  });

  it('is in the File menu while the workbench is on screen', async () => {
    const user = userEvent.setup();
    await on();

    // From the keyboard: jsdom lays nothing out, and the resizable panels take every pointer press
    // for a grab of one of their handles.
    screen.getByRole('menuitem', { name: t('fileMenu.file.title') }).focus();
    await user.keyboard('{ArrowDown}');

    expect(
      await screen.findByRole('menuitem', { name: t('command.workbench.closeFolderTab') }),
    ).toBeVisible();
  });
});

describe('a reload gives each tab back as it was — plan 06, S-134', () => {
  it('keeps the view, the side bar and the panel of each tab, and the URL still says which is on screen', async () => {
    const user = userEvent.setup();
    const first = await on();
    await user.click(view('workbench.search.label'));
    await user.click(screen.getByRole('button', { name: t('workbench.layout.panel') }));
    await user.click(await tabNamed('b'));
    await waitFor(() => {
      expect(first.search()).toEqual({ folder: B });
    });
    await user.click(await screen.findByRole('button', { name: t('workbench.layout.sideBar') }));
    first.unmount();

    // What a reload does: the page's memory is gone, what this browser kept is not.
    releaseFolderTabs();
    await on(A);

    expect(view('workbench.search.label')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: t('workbench.panel.label') })).toBeVisible();
    expect(localStorage.getItem(`${VISITOR_PREFIX}workbench.lastFolder`)).toBe(JSON.stringify(A));

    await user.click(await tabNamed('b'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('workbench.layout.sideBar') })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  it('drops what a folder no longer open had kept, once the tabs are read — S-135', async () => {
    localStorage.setItem(
      `${VISITOR_PREFIX}workbench.tabState`,
      JSON.stringify({
        format: 1,
        tabs: {
          '/srv/projects/gone': { 'workbench.layout': { version: 1, state: { view: 'search' } } },
        },
      }),
    );

    await on();

    await waitFor(() => {
      expect(
        Object.keys(
          JSON.parse(localStorage.getItem(`${VISITOR_PREFIX}workbench.tabState`) ?? '{}').tabs,
        ),
      ).not.toContain('/srv/projects/gone');
    });
  });
});
