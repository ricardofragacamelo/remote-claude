import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { commandRegistry } from '@/features/commands';
import { useLocale } from '@/shared/hooks/useLocale';
import { useTheme } from '@/shared/hooks/useTheme';
import { mountApp } from '../../support/app';
import { translator } from '../../support/render';
import { aViewport } from '../../support/viewport';
import {
  aListing,
  fakeWorkspaceApi,
  projects,
  refusal,
  scratch,
} from '../../support/workspace-api';
import type { RecentDto, WorkspaceRoutes } from '../../support/workspace-api';

const t = translator('en');

const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

function aRecent(name: string, extra: Partial<RecentDto> = {}): RecentDto {
  return {
    path: `${projects.path}/${name}`,
    rootLabel: 'Projects',
    lastOpenedAt: '2026-09-29T10:00:00.000Z',
    pinned: false,
    available: true,
    ...extra,
  };
}

const ROUTES: WorkspaceRoutes = {
  roots: [scratch, projects],
  recent: [
    aRecent('pinned', { pinned: true }),
    aRecent('app'),
    aRecent('gone', { available: false }),
  ],
  openFolders: [],
  directories: (asked) => aListing(projects, asked.get('path') ?? '', ['app']),
};

beforeEach(() => {
  useAuthStore.setState({ status: 'unknown', session: null });
  vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The app on `href`, signed in, once the frame's services are up. */
async function at(href: string, routes: WorkspaceRoutes = ROUTES) {
  fakeWorkspaceApi(routes);
  const mounted = mountApp(href);
  await screen.findByRole('menuitem', { name: t('fileMenu.file.title') });
  return { user: userEvent.setup(), ...mounted };
}

function fileMenu(): HTMLElement {
  return screen.getByRole('menuitem', { name: t('fileMenu.file.title') });
}

async function palette(user: ReturnType<typeof userEvent.setup>, typed = ''): Promise<HTMLElement> {
  await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
  const dialog = await screen.findByRole('dialog', { name: t('palette.dialog.title') });
  if (typed !== '') await user.type(within(dialog).getByRole('combobox'), typed);
  return dialog;
}

describe('"Open folder…" from anywhere — plan 06, S-186, S-197', () => {
  it.each(['/', '/rules'])('opens the one dialog on Ctrl+O, on %s', async (href) => {
    const { user } = await at(href);

    await user.keyboard('{Control>}o{/Control}');

    expect(await screen.findByRole('dialog', { name: t('workspace.dialog.title') })).toBeVisible();
  });

  it('writes the shortcut beside the button of the welcome screen, read from the registry', async () => {
    await at('/');

    const button = await screen.findByRole('button', { name: t('workspace.welcome.openFolder') });
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+O');
    expect(screen.getByText('Ctrl+O')).toBeVisible();
  });

  it('opens it from the File menu, over the screen it was asked on', async () => {
    const { user, ...mounted } = await at('/rules');

    await user.click(fileMenu());
    await user.click(await screen.findByRole('menuitem', { name: /Open folder/ }));
    expect(await screen.findByRole('dialog', { name: t('workspace.dialog.title') })).toBeVisible();
    expect(mounted.path()).toBe('/rules');
  });
});

describe('"Open recent" — plan 06, S-195', () => {
  it('lists the recent folders in the File menu, pinned first, and one that cannot open is not offered', async () => {
    const { user, ...mounted } = await at('/rules');

    await user.click(fileMenu());
    await user.click(
      await screen.findByRole('menuitem', { name: t('command.workspace.openRecent') }),
    );
    await user.keyboard('{ArrowRight}');
    const pinned = await screen.findByRole('menuitem', { name: /pinned/ });
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');

    expect(items.findIndex((item) => item.startsWith('pinned'))).toBeLessThan(
      items.findIndex((item) => item.startsWith('app')),
    );
    expect(screen.getByRole('menuitem', { name: /gone/ })).toHaveAttribute('aria-disabled', 'true');

    await waitFor(() => {
      expect(pinned).toHaveFocus();
    });
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: `${projects.path}/pinned` });
    });
  });

  it('ends in "More…", which is the welcome screen', async () => {
    const { user, ...mounted } = await at('/rules');

    await user.click(fileMenu());
    await user.click(
      await screen.findByRole('menuitem', { name: t('command.workspace.openRecent') }),
    );
    await user.keyboard('{ArrowRight}');
    const more = await screen.findByRole('menuitem', { name: t('workspace.recentMenu.more') });
    await user.keyboard('{End}');
    await waitFor(() => {
      expect(more).toHaveFocus();
    });
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mounted.path()).toBe('/');
    });
  });

  it('is a list of its own in the palette, narrowed as it is typed', async () => {
    const { user, ...mounted } = await at('/rules');
    await palette(user, ' recent{Enter}');

    const dialog = await screen.findByRole('dialog', { name: t('palette.dialog.title') });
    await waitFor(() => {
      expect(
        within(dialog)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        expect.stringContaining('pinned'),
        expect.stringContaining('app'),
        t('workspace.recentMenu.more'),
      ]);
    });
    expect(within(dialog).getByRole('combobox')).toHaveAttribute(
      'placeholder',
      t('workspace.recentMode.placeholder'),
    );

    await user.type(within(dialog).getByRole('combobox'), 'app{Enter}');
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: `${projects.path}/app` });
    });
  });

  it('says so in the palette while the recent folders load', async () => {
    const { user } = await at('/rules', { ...ROUTES, recent: () => new Promise(() => undefined) });
    await palette(user, ' recent{Enter}');

    // Reopened on the list of its own: another dialog than the one the command was picked in.
    expect(await screen.findByText(t('workspace.recentMenu.loading'))).toBeVisible();
  });
});

describe('"Open recent" when there is nothing to list — plan 06, S-195', () => {
  const refused = refusal('NETWORK_UNREACHABLE', 'common.error.offline');

  it('says in the palette that the recent folders cannot be read', async () => {
    const { user } = await at('/rules', { ...ROUTES, recent: refused });
    await palette(user, ' recent{Enter}');

    expect(await screen.findByText(t('workspace.recentMenu.unavailable'))).toBeVisible();
  });

  it('says in the File menu that they cannot be read — or that there are none yet', async () => {
    const { user } = await at('/rules', { ...ROUTES, recent: refused });

    await user.click(fileMenu());
    await user.click(
      await screen.findByRole('menuitem', { name: t('command.workspace.openRecent') }),
    );
    await user.keyboard('{ArrowRight}');

    expect(
      await screen.findByRole('menuitem', { name: t('workspace.recentMenu.unavailable') }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('says there are none yet, and still leads to the welcome screen', async () => {
    const { user } = await at('/rules', { ...ROUTES, recent: [] });

    await user.click(fileMenu());
    await user.click(
      await screen.findByRole('menuitem', { name: t('command.workspace.openRecent') }),
    );
    await user.keyboard('{ArrowRight}');

    expect(
      await screen.findByRole('menuitem', { name: t('workspace.recentMenu.empty') }),
    ).toBeVisible();
    expect(screen.getByRole('menuitem', { name: t('workspace.recentMenu.more') })).toBeVisible();
  });

  it('says it is loading in the File menu', async () => {
    const { user } = await at('/rules', { ...ROUTES, recent: () => new Promise(() => undefined) });

    await user.click(fileMenu());
    await user.click(
      await screen.findByRole('menuitem', { name: t('command.workspace.openRecent') }),
    );
    await user.keyboard('{ArrowRight}');

    expect(
      await screen.findByRole('menuitem', { name: t('workspace.recentMenu.loading') }),
    ).toBeVisible();
  });

  it('leads to the welcome screen from "More…" in the palette', async () => {
    const { user, ...mounted } = await at('/rules', { ...ROUTES, recent: [] });
    await palette(user, ' recent{Enter}');

    await user.click(await screen.findByRole('option', { name: t('workspace.recentMenu.more') }));
    await waitFor(() => {
      expect(mounted.path()).toBe('/');
    });
  });
});

describe('the help of a screen — plan 06, S-198', () => {
  it('lists the shortcuts the registry has, and opens on Shift+F1', async () => {
    const { user } = await at('/rules');

    await user.keyboard('{Shift>}{F1}{/Shift}');

    const shortcuts = await screen.findByRole('region', { name: t('help.section.shortcuts') });
    expect(within(shortcuts).getByText('Ctrl+Shift+P')).toBeVisible();
    expect(within(shortcuts).getByText(t('command.palette.show'))).toBeVisible();
    expect(within(shortcuts).getByText('Shift+F1')).toBeVisible();
  });

  it('is in the palette on a screen with a help', async () => {
    const { user } = await at('/rules');
    const dialog = await palette(user, ' help for');

    expect(within(dialog).getByRole('option', { name: /Help for this screen/ })).toBeVisible();
    expect(commandRegistry.command('help.show')?.when?.()).toBe(true);
  });
});

describe('the commands of the app — plan 06, B-23', () => {
  it('goes to each screen of the navigation', async () => {
    const { user, ...mounted } = await at('/rules');
    await palette(user, ' audit{Enter}');

    await waitFor(() => {
      expect(mounted.path()).toBe('/audit');
    });
  });

  it('switches the theme, and says the other one next time', async () => {
    const { user } = await at('/rules');
    await palette(user, ' dark theme{Enter}');

    await waitFor(() => {
      expect(useTheme.getState().theme).toBe('dark');
    });
    expect(commandRegistry.command('preferences.toggleTheme')?.labelKey).toBe(
      'status.theme.toLight',
    );
  });

  it('switches the language, and offers only the other one', async () => {
    const { user } = await at('/rules');
    const dialog = await palette(user, ' language');

    expect(
      within(dialog)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([expect.stringContaining(t('command.preferences.languagePtBR'))]);
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(useLocale.getState().locale).toBe('pt-BR');
    });
    expect(commandRegistry.command('preferences.language.en')?.when?.()).toBe(true);
  });
});

describe('the File menu under md — plan 06, S-129', () => {
  it('lives in the menu of the navigation, and picking an item closes it', async () => {
    aViewport('phone');
    fakeWorkspaceApi(ROUTES);
    mountApp('/rules');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: t('navigation.menu.open') }));
    const sheet = await screen.findByRole('dialog', { name: t('navigation.global.label') });
    await user.click(within(sheet).getByRole('menuitem', { name: t('fileMenu.file.title') }));
    await user.click(await screen.findByRole('menuitem', { name: /Open folder/ }));

    expect(await screen.findByRole('dialog', { name: t('workspace.dialog.title') })).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: t('navigation.global.label') })).toBeNull();
    });
  });
});
