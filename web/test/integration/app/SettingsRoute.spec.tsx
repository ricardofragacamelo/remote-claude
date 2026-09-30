import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { settingsSections } from '@/features/settings';
import { useDensity } from '@/shared/hooks/useDensity';
import { useLocale } from '@/shared/hooks/useLocale';
import { useTheme } from '@/shared/hooks/useTheme';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import { mountApp } from '../../support/app';
import { translator } from '../../support/render';
import { fakeWorkspaceApi, projects, refusal, scratch } from '../../support/workspace-api';
import type { RecentDto } from '../../support/workspace-api';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

const recent: RecentDto = {
  path: '/srv/projects/app',
  rootLabel: 'Projects',
  lastOpenedAt: '2026-09-29T10:00:00.000Z',
  pinned: false,
  available: true,
};

function heading(key: string): Promise<HTMLElement> {
  return screen.findByRole('heading', { level: 2, name: t(key) });
}

function option(key: string): HTMLElement {
  return screen.getByRole('group', { name: t(key) });
}

describe('the app’s Settings — plan 06, B-31', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('shows the section the address names, and moves the address with the section — S-142', async () => {
    fakeWorkspaceApi({ roots: [projects], recent: [] });
    const user = userEvent.setup();
    const mounted = mountApp('/settings/appearance');

    expect(await heading('settings.section.appearance')).toBeVisible();
    expect(screen.getByRole('link', { name: t('navigation.entry.settings') })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(screen.getByRole('button', { name: t('settings.section.workspaces') }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/settings/workspaces');
    });
    expect(await heading('settings.section.workspaces')).toBeVisible();
  });

  it('lands a section it does not have on the first one, without an error — S-142', async () => {
    const mounted = mountApp('/settings/terminal');

    expect(await heading('settings.section.appearance')).toBeVisible();
    expect(mounted.path()).toBe('/settings/appearance');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('Appearance', () => {
    it('changes the theme at once, and keeps it for this visitor — S-143', async () => {
      const user = userEvent.setup();
      mountApp('/settings/appearance');
      await heading('settings.section.appearance');

      await user.click(
        within(option('settings.appearance.theme')).getByRole('radio', {
          name: t('settings.appearance.themeDark'),
        }),
      );

      expect(useTheme.getState()).toMatchObject({ preference: 'dark', theme: 'dark' });
      expect(localStorage.getItem(`${VISITOR_PREFIX}theme`)).toBe('"dark"');
    });

    it('changes the language and the density at once, and keeps them — S-143', async () => {
      const user = userEvent.setup();
      mountApp('/settings/appearance');
      await heading('settings.section.appearance');

      await user.click(screen.getByRole('radio', { name: t('status.language.ptBR') }));
      await user.click(
        screen.getByRole('radio', { name: t('settings.appearance.densityComfortable') }),
      );

      expect(useLocale.getState()).toMatchObject({ locale: 'pt-BR', picked: true });
      expect(useDensity.getState().density).toBe('comfortable');
      expect(localStorage.getItem(`${VISITOR_PREFIX}locale`)).toBe('"pt-BR"');
      expect(localStorage.getItem(`${VISITOR_PREFIX}density`)).toBe('"comfortable"');
    });

    it('names every default, and offers "restore" only where the option moved — S-201', async () => {
      const user = userEvent.setup();
      mountApp('/settings/appearance');
      await heading('settings.section.appearance');
      const theme = option('settings.appearance.theme');

      expect(
        within(theme).getByText(
          t('settings.option.default', { value: t('settings.appearance.themeSystem') }),
        ),
      ).toBeVisible();
      expect(screen.queryByRole('button', { name: /^Restore the default/ })).toBeNull();

      await user.click(
        within(theme).getByRole('radio', { name: t('settings.appearance.themeLight') }),
      );
      await user.click(
        within(theme).getByRole('button', {
          name: t('settings.option.restoreLabel', { option: t('settings.appearance.theme') }),
        }),
      );

      expect(useTheme.getState().preference).toBe('system');
      expect(
        within(theme).getByRole('radio', { name: t('settings.appearance.themeSystem') }),
      ).toBeChecked();
      expect(within(theme).queryByRole('button')).toBeNull();
    });

    it('restores the language by forgetting the choice, and the density to compact — S-201', async () => {
      const user = userEvent.setup();
      useLocale.getState().setLocale('pt-BR');
      useDensity.getState().setDensity('comfortable');
      mountApp('/settings/appearance');
      await heading('settings.section.appearance');

      await user.click(
        screen.getByRole('button', {
          name: t('settings.option.restoreLabel', { option: t('settings.appearance.language') }),
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: t('settings.option.restoreLabel', { option: t('settings.appearance.density') }),
        }),
      );

      expect(useLocale.getState().picked).toBe(false);
      expect(localStorage.getItem(`${VISITOR_PREFIX}locale`)).toBeNull();
      expect(useDensity.getState().density).toBe('compact');
    });
  });

  describe('the search', () => {
    it('finds an option by its label and takes the person to it — S-203', async () => {
      fakeWorkspaceApi({ roots: [projects], recent: [] });
      const user = userEvent.setup();
      const mounted = mountApp('/settings/appearance');
      await heading('settings.section.appearance');

      await user.type(
        screen.getByRole('searchbox', { name: t('settings.search.label') }),
        'recent',
      );
      const results = screen.getByRole('list', { name: t('settings.search.results') });
      await user.click(within(results).getByRole('button', { name: /^Recent/ }));

      await waitFor(() => {
        expect(mounted.path()).toBe('/settings/workspaces');
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(document.getElementById('setting-recent'));
      });
    });

    it('takes the person to an option of the section on screen too', async () => {
      const user = userEvent.setup();
      mountApp('/settings/appearance');
      await heading('settings.section.appearance');

      await user.type(screen.getByRole('searchbox'), 'dens');
      await user.click(screen.getByRole('button', { name: /^Density/ }));

      await waitFor(() => {
        expect(document.activeElement).toBe(document.getElementById('setting-density'));
      });
    });

    it('says when nothing matches, with what was searched — S-203', async () => {
      const user = userEvent.setup();
      mountApp('/settings/appearance');
      await heading('settings.section.appearance');

      await user.type(screen.getByRole('searchbox'), 'zzz');

      expect(screen.getByRole('status')).toHaveTextContent(
        t('settings.search.none', { query: 'zzz' }),
      );
    });
  });

  describe('Workspaces', () => {
    it('lists the roots read only, with the command that adds one, ready to copy — S-144', async () => {
      fakeWorkspaceApi({ roots: [projects, scratch], recent: [] });
      const user = userEvent.setup();
      // After the user is set up: it puts a clipboard of its own on the navigator.
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      mountApp('/settings/workspaces');

      const roots = await screen.findByRole('list', { name: t('workspace.roots.title') });
      expect(within(roots).getByText(projects.path)).toBeVisible();
      expect(within(roots).queryAllByRole('button')).toEqual([]);
      expect(screen.queryAllByRole('textbox')).toEqual([]);

      await user.click(screen.getByRole('button', { name: t('workspace.allowlist.copy') }));
      expect(writeText).toHaveBeenCalledWith(t('workspace.allowlist.command'));
    });

    it('pins and removes a recent folder, and does not open it from here — S-144', async () => {
      const api = fakeWorkspaceApi({
        roots: [projects],
        recent: [recent],
        pin: () => undefined,
        forget: () => undefined,
      });
      const user = userEvent.setup();
      const mounted = mountApp('/settings/workspaces');

      const list = await screen.findByRole('list', { name: t('workspace.recent.title') });
      await user.click(
        within(list).getByRole('button', { name: t('workspace.recent.pin', { name: 'app' }) }),
      );
      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/workspaces/recent/pin', {
          path: recent.path,
          pinned: true,
        });
      });
      await user.click(
        within(list).getByRole('button', { name: t('workspace.recent.remove', { name: 'app' }) }),
      );
      await waitFor(() => {
        expect(api.remove).toHaveBeenCalled();
      });

      expect(within(list).queryByRole('button', { name: /^app/ })).toBeNull();
      expect(mounted.path()).toBe('/settings/workspaces');
    });

    it('says what to do when the roots could not be read, and tries again — S-147', async () => {
      let attempt = 0;
      fakeWorkspaceApi({
        roots: () => {
          attempt += 1;
          return attempt === 1
            ? Promise.reject(refusal('NETWORK_UNREACHABLE', 'common.error.offline'))
            : Promise.resolve([projects]);
        },
        recent: [],
      });
      const user = userEvent.setup();
      mountApp('/settings/workspaces');

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(t('common.error.offline'));
      await user.click(within(alert).getByRole('button', { name: t('common.action.retry') }));

      expect(await screen.findByText(projects.path)).toBeVisible();
    });

    it('offers the help about the allowlist — S-153', async () => {
      fakeWorkspaceApi({ roots: [projects], recent: [] });
      const user = userEvent.setup();
      mountApp('/settings/workspaces');
      await screen.findByText(projects.path);

      await user.click(
        screen.getByRole('button', {
          name: t('help.learnMore.label', { topic: t('help.topic.allowlist') }),
        }),
      );

      await waitFor(() => {
        expect(document.activeElement).toBe(document.getElementById('help-states'));
      });
      expect(screen.getByText(t('settings.help.states'))).toBeVisible();
    });
  });

  it('shows no section at all when none is registered, rather than breaking', async () => {
    vi.spyOn(settingsSections, 'entries').mockReturnValue([]);
    mountApp('/settings/appearance');

    expect(
      await screen.findByRole('heading', { level: 1, name: t('settings.screen.title') }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('has no accessibility violation', async () => {
    fakeWorkspaceApi({ roots: [projects], recent: [recent] });
    const { container } = mountApp('/settings/workspaces');
    await screen.findByText(projects.path);

    expect(await axe(container)).toHaveNoViolations();
  });
});
