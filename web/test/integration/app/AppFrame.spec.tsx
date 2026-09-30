import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Info } from 'lucide-react';

import { globalNavigation, manageMenu } from '@/app/global-navigation';
import { workbenchLocation } from '@/app/workbench-location';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { navigation } from '@/shared/lib/navigation';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import { mountApp } from '../../support/app';
import { translator } from '../../support/render';
import { aViewport } from '../../support/viewport';
import { aTab, fakeWorkspaceApi, projects } from '../../support/workspace-api';

const t = translator('en');
const A = `${projects.path}/a`;
const B = `${projects.path}/b`;

/** An ID token naming somebody — unsigned, which is all a display needs. */
function tokenNaming(name: string): string {
  return `h.${btoa(JSON.stringify({ name }))}.s`;
}

const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: tokenNaming('Ana Souza'),
};

function signedIn(): void {
  vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
}

function signedOut(): void {
  vi.spyOn(authService, 'renewSession').mockRejectedValue(new Error('no cookie'));
}

function link(name: string): Promise<HTMLElement> {
  return screen.findByRole('link', { name });
}

describe('the frame of the app — plan 06, B-18', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists the screens in order, one per subject — S-89', async () => {
    signedIn();
    fakeWorkspaceApi({ openFolders: [] });
    mountApp('/rules');

    const nav = await screen.findByRole('navigation', { name: t('navigation.global.label') });

    expect(
      within(nav)
        .getAllByRole('link')
        .map((each) => each.getAttribute('aria-label')),
    ).toEqual([
      t('navigation.entry.workbench'),
      t('navigation.entry.audit'),
      t('navigation.entry.rules'),
      t('navigation.entry.devices'),
      t('navigation.entry.diagnostics'),
      t('navigation.entry.settings'),
    ]);
  });

  it.each([
    ['/rules/rule_1', 'navigation.entry.rules'],
    ['/audit?decision=allowed&toolName=Bash', 'navigation.entry.audit'],
    ['/', 'navigation.entry.workbench'],
  ])('lights the screen of %s, deep links included — S-90', async (href, key) => {
    signedIn();
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
    mountApp(href);

    expect(await link(t(key))).toHaveAttribute('aria-current', 'page');
    const others = screen
      .getAllByRole('link')
      .filter(
        (each) => each.getAttribute('aria-label') !== t(key) && each.hasAttribute('aria-current'),
      );
    expect(others).toEqual([]);
  });

  it('follows a link of the navigation without leaving the app', async () => {
    signedIn();
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();
    const mounted = mountApp('/rules');

    await user.click(await link(t('navigation.entry.audit')));

    await waitFor(() => {
      expect(mounted.path()).toBe('/audit');
    });
    expect(await link(t('navigation.entry.audit'))).toHaveAttribute('aria-current', 'page');
  });

  it('leaves a link opened in a new tab to the browser', async () => {
    signedIn();
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();
    const mounted = mountApp('/rules');

    await user.keyboard('{Control>}');
    await user.click(await link(t('navigation.entry.audit')));
    await user.keyboard('{/Control}');

    expect(mounted.path()).toBe('/rules');
  });

  it('leads "Workbench" to the tab this browser had on screen last — S-187', async () => {
    signedIn();
    fakeWorkspaceApi({ openFolders: [aTab(A), aTab(B)] });
    localStorage.setItem(`${VISITOR_PREFIX}workbench.lastFolder`, JSON.stringify(B));
    mountApp('/rules');

    await waitFor(async () => {
      expect(await link(t('navigation.entry.workbench'))).toHaveAttribute(
        'href',
        workbenchLocation({ folder: B }),
      );
    });
  });

  it('leads "Workbench" to the first tab when the last one closed, and home without tabs — S-187', async () => {
    signedIn();
    fakeWorkspaceApi({ openFolders: [aTab(A)] });
    localStorage.setItem(`${VISITOR_PREFIX}workbench.lastFolder`, JSON.stringify(B));
    const first = mountApp('/rules');

    await waitFor(async () => {
      expect(await link(t('navigation.entry.workbench'))).toHaveAttribute(
        'href',
        workbenchLocation({ folder: A }),
      );
    });
    first.unmount();
    vi.restoreAllMocks();
    signedIn();
    fakeWorkspaceApi({ openFolders: [] });

    mountApp('/rules');
    expect(await link(t('navigation.entry.workbench'))).toHaveAttribute('href', '/');
  });

  it('asks nobody signed out for their tabs', async () => {
    signedOut();
    const get = vi.spyOn(api, 'get');
    mountApp('/rules');

    expect(await screen.findByText(t('auth.signIn.title'))).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('brings a deep link opened signed out back with its search — S-91', async () => {
    signedOut();
    const login = vi.spyOn(authService, 'beginLogin').mockResolvedValue('https://provider.test/a');
    vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const address = workbenchLocation({ folder: '/srv/projects/a b#1' });
    mountApp(address);

    await user.click(await screen.findByRole('button', { name: t('auth.signIn.action') }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith(address);
    });
  });

  it('says who is signed in, in the account menu', async () => {
    signedIn();
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();
    mountApp('/rules');

    await user.click(await screen.findByRole('button', { name: t('navigation.account.label') }));

    expect(
      await screen.findByText(t('navigation.account.signedInAs', { name: 'Ana Souza' })),
    ).toBeVisible();
    expect(screen.getByRole('menuitem', { name: t('auth.signOut.action') })).toBeVisible();
  });

  it('offers Settings and About in the "manage" menu, and the palette only to somebody signed in — B-32', async () => {
    signedOut();
    const user = userEvent.setup();
    mountApp('/rules');

    await user.click(await screen.findByRole('button', { name: t('navigation.manage.label') }));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      t('navigation.entry.settings'),
      t('navigation.entry.about'),
    ]);
  });

  it('leads to About from the "manage" menu — B-32', async () => {
    signedIn();
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();
    const mounted = mountApp('/rules');

    await user.click(await screen.findByRole('button', { name: t('navigation.manage.label') }));
    await user.click(await screen.findByRole('menuitem', { name: t('navigation.entry.about') }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/about');
    });
  });

  it('offers the palette in the "manage" menu, and opens it — B-24', async () => {
    signedIn();
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();
    mountApp('/rules');

    await user.click(await screen.findByRole('button', { name: t('navigation.manage.label') }));
    await user.click(await screen.findByRole('menuitem', { name: t('command.palette.show') }));

    expect(await screen.findByRole('dialog', { name: t('palette.dialog.title') })).toBeVisible();
  });

  it('shows what a later plan registers in the "manage" menu, and does it', async () => {
    signedIn();
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
    const run = vi.fn();
    const removeRun = manageMenu.register({
      id: 'later-run',
      position: 100,
      labelKey: 'navigation.entry.audit',
      icon: Info,
      run,
    });
    const removeGo = manageMenu.register({
      id: 'trail',
      position: 200,
      labelKey: 'navigation.entry.rules',
      icon: Info,
      href: '/audit',
    });
    const user = userEvent.setup();
    const mounted = mountApp('/rules');

    try {
      await user.click(await screen.findByRole('button', { name: t('navigation.manage.label') }));
      await user.click(await screen.findByRole('menuitem', { name: t('navigation.entry.audit') }));
      expect(run).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: t('navigation.manage.label') }));
      await user.click(await screen.findByRole('menuitem', { name: t('navigation.entry.rules') }));
      await waitFor(() => {
        expect(mounted.path()).toBe('/audit');
      });
    } finally {
      removeRun();
      removeGo();
    }
  });

  it('shows the count a place registers beside it', async () => {
    signedIn();
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
    const rules = globalNavigation.entries().find((entry) => entry.id === 'rules')!;
    const Badge = (): React.JSX.Element => <span>{t('navigation.bar.appName')}</span>;
    const remove = globalNavigation.register({ ...rules, id: 'counted', position: 350, Badge });

    try {
      mountApp('/rules');
      expect(await screen.findByText(t('navigation.bar.appName'))).toBeInTheDocument();
    } finally {
      remove();
    }
  });

  it('frames the "not found" too, outside the sign-in gate', async () => {
    signedOut();
    mountApp('/no/such/screen');

    expect(await screen.findByRole('heading', { name: t('common.notFound.title') })).toBeVisible();
    expect(screen.getByRole('navigation', { name: t('navigation.global.label') })).toBeVisible();
    expect(screen.queryByText(t('auth.signIn.title'))).toBeNull();
  });

  it('has no accessibility violation', async () => {
    signedIn();
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });
    const { container } = mountApp('/rules');
    await screen.findByText(t('rules.list.emptyTitle'));

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('the frame under md — plan 06, S-92', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    aViewport('phone');
    signedIn();
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('turns the navigation into a menu that holds the focus, and Esc gives the focus back', async () => {
    const user = userEvent.setup();
    mountApp('/rules');
    const opener = await screen.findByRole('button', { name: t('navigation.menu.open') });
    expect(screen.queryByRole('link', { name: t('navigation.entry.audit') })).toBeNull();

    await user.click(opener);

    const menu = await screen.findByRole('dialog', { name: t('navigation.global.label') });
    expect(within(menu).getByRole('link', { name: t('navigation.entry.rules') })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(menu.contains(document.activeElement)).toBe(true);
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(menu.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.activeElement).toBe(opener);
  });

  it('closes the menu once a screen is picked, on that screen', async () => {
    const user = userEvent.setup();
    const mounted = mountApp('/rules');

    await user.click(await screen.findByRole('button', { name: t('navigation.menu.open') }));
    await user.click(await screen.findByRole('link', { name: t('navigation.entry.audit') }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/audit');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('has no accessibility violation with the menu open', async () => {
    const user = userEvent.setup();
    const { container } = mountApp('/rules');

    await user.click(await screen.findByRole('button', { name: t('navigation.menu.open') }));
    const menu = await screen.findByRole('dialog');

    await act(async () => {
      expect(await axe(container)).toHaveNoViolations();
      expect(await axe(menu)).toHaveNoViolations();
    });
  });
});
