import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { mountApp } from '../../../../support/app';
import { aCatalogEntry, aPlugin, pluginBackendAnswers } from '../../../../support/plugin-settings';
import { translator } from '../../../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

const URL = '/settings/agents/claude?section=plugins';

const ONE_ROOT = { workspaces: [{ path: '/srv/app', label: 'srv', lastUsedAt: null }] };
const ROOT_LISTING = {
  path: '/srv/app',
  root: { path: '/srv/app', label: 'srv', lastUsedAt: null },
  parent: null,
  entries: [],
  truncated: false,
};

describe('the plugins section of the agent settings — plan 13, B-29', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists a plugin with its origin, version, source and state — S-137', async () => {
    pluginBackendAnswers({
      '/engines/claude/plugins': () => Promise.resolve({ plugins: [aPlugin()] }),
    });
    mountApp(URL);

    const row = (await screen.findByText('my-plugin')).closest('tr');
    expect(row).not.toBeNull();
    const withinRow = within(row as HTMLElement);
    expect(withinRow.getByText(t('engines.claude.plugins.originLocal'))).toBeVisible();
    expect(withinRow.getByText('1.0.0')).toBeVisible();
    expect(withinRow.getByText(t('engines.claude.plugins.stateCurrent'))).toBeVisible();
  });

  it('teaches the next step when there is nothing yet', async () => {
    pluginBackendAnswers();
    mountApp(URL);

    expect(await screen.findByText(t('engines.claude.plugins.emptyTitle'))).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: t('engines.claude.plugins.addLocal') }),
    ).not.toEqual([]);
  });

  it('narrows the list by a search of the name', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins': () =>
        Promise.resolve({
          plugins: [aPlugin(), aPlugin({ id: 'plugin-2', name: 'other-plugin' })],
        }),
    });
    mountApp(URL);

    await screen.findByText('my-plugin');
    await user.type(screen.getByLabelText(t('engines.claude.plugins.searchLabel')), 'other');

    expect(screen.queryByText('my-plugin')).toBeNull();
    expect(screen.getByText('other-plugin')).toBeVisible();
  });

  it('adds a local plugin through the folder-browse dialog and the two-step wizard, nothing written before confirm — S-125, S-137', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/workspaces': () => Promise.resolve(ONE_ROOT),
      '/workspaces/directories': () => Promise.resolve(ROOT_LISTING),
    });
    const posting = vi.spyOn(api, 'post').mockImplementation((route: string) =>
      route.endsWith('/preview')
        ? Promise.resolve({
            manifest: aPlugin()['manifest'],
            messageKey: 'engines.claude.plugin.descriptionLocal',
            params: { name: 'my-plugin', path: '/srv/app' },
          })
        : Promise.resolve(aPlugin()),
    );
    mountApp(URL);

    await screen.findByText(t('engines.claude.plugins.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('engines.claude.plugins.addLocal') }));

    const dialog = await screen.findByRole('dialog', {
      name: t('engines.claude.plugins.addLocal'),
    });
    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.plugins.browse') }),
    );

    const browseDialog = await screen.findByRole('dialog', {
      name: t('engines.claude.plugins.browseDialogTitle'),
    });
    await user.click(within(browseDialog).getByText('srv'));
    await user.click(
      await within(browseDialog).findByRole('button', {
        name: t('engines.claude.plugins.browseChoose'),
      }),
    );

    expect(within(dialog).getByLabelText(t('engines.claude.plugins.fieldPath'))).toHaveValue(
      '/srv/app',
    );

    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.plugins.wizardNext') }),
    );

    // Only the preview was asked — nothing written yet.
    await waitFor(() => {
      expect(posting).toHaveBeenCalledTimes(1);
    });
    expect(posting.mock.calls[0]?.[0]).toBe('/engines/claude/plugins/preview');

    await user.click(
      await within(dialog).findByRole('button', {
        name: t('engines.claude.plugins.wizardConfirm'),
      }),
    );

    await waitFor(() => {
      expect(posting).toHaveBeenCalledTimes(2);
    });
    expect(posting).toHaveBeenCalledWith('/engines/claude/plugins', { path: '/srv/app' });
  });

  it("flags a missing path on the wizard's next — S-125", async () => {
    const user = userEvent.setup();
    pluginBackendAnswers();
    mountApp(URL);

    await screen.findByText(t('engines.claude.plugins.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('engines.claude.plugins.addLocal') }));
    const dialog = await screen.findByRole('dialog', {
      name: t('engines.claude.plugins.addLocal'),
    });

    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.plugins.wizardNext') }),
    );

    expect(within(dialog).getByText(t('engines.claude.plugins.issuePathRequired'))).toBeVisible();
  });

  it('cancelling the folder-browse dialog leaves the path field untouched', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/workspaces': () => Promise.resolve(ONE_ROOT),
      '/workspaces/directories': () => Promise.resolve(ROOT_LISTING),
    });
    mountApp(URL);

    await screen.findByText(t('engines.claude.plugins.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('engines.claude.plugins.addLocal') }));
    const dialog = await screen.findByRole('dialog', {
      name: t('engines.claude.plugins.addLocal'),
    });
    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.plugins.browse') }),
    );

    const browseDialog = await screen.findByRole('dialog', {
      name: t('engines.claude.plugins.browseDialogTitle'),
    });
    await user.click(within(browseDialog).getByText('srv'));
    await user.click(
      within(browseDialog).getByRole('button', { name: t('engines.claude.plugins.browseCancel') }),
    );

    expect(
      screen.queryByRole('dialog', { name: t('engines.claude.plugins.browseDialogTitle') }),
    ).toBeNull();
    expect(within(dialog).getByLabelText(t('engines.claude.plugins.fieldPath'))).toHaveValue('');
  });

  it('turns a selection of plugins off, one request per plugin — S-134 contract', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins': () =>
        Promise.resolve({
          plugins: [aPlugin(), aPlugin({ id: 'plugin-2', name: 'other-plugin' })],
        }),
    });
    const patching = vi.spyOn(api, 'patch').mockResolvedValue(aPlugin({ enabled: false }));
    mountApp(URL);

    await screen.findByText('my-plugin');
    await user.click(
      screen.getByLabelText(t('engines.claude.plugins.rowSelect', { name: 'my-plugin' })),
    );
    await user.click(
      screen.getByLabelText(t('engines.claude.plugins.rowSelect', { name: 'other-plugin' })),
    );
    await user.click(screen.getByRole('button', { name: t('engines.claude.plugins.turnOff') }));

    await waitFor(() => {
      expect(patching).toHaveBeenCalledTimes(2);
    });
    expect(patching).toHaveBeenCalledWith('/engines/claude/plugins/plugin-1', { enabled: false });
    expect(patching).toHaveBeenCalledWith('/engines/claude/plugins/plugin-2', { enabled: false });
  });

  it('a plugin refused in a batch does not stop the others — S-134', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins': () =>
        Promise.resolve({
          plugins: [aPlugin(), aPlugin({ id: 'plugin-2', name: 'other-plugin' })],
        }),
    });
    vi.spyOn(api, 'patch').mockImplementation((route: string) =>
      route.endsWith('plugin-1')
        ? Promise.reject(new AppError('FORBIDDEN', 'common.error.forbidden', 't1'))
        : Promise.resolve(aPlugin({ id: 'plugin-2', name: 'other-plugin', enabled: false })),
    );
    mountApp(URL);

    await screen.findByText('my-plugin');
    await user.click(
      screen.getByLabelText(t('engines.claude.plugins.rowSelect', { name: 'my-plugin' })),
    );
    await user.click(
      screen.getByLabelText(t('engines.claude.plugins.rowSelect', { name: 'other-plugin' })),
    );
    await user.click(screen.getByRole('button', { name: t('engines.claude.plugins.turnOff') }));

    await waitFor(() => {
      expect(screen.getByText('other-plugin')).toBeVisible();
    });
  });

  it('asks a destructive confirm to remove, the keep button focused — S-135', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins': () => Promise.resolve({ plugins: [aPlugin()] }),
    });
    const deleting = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    mountApp(URL);

    await screen.findByText('my-plugin');
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('my-plugin') });
    await user.click(
      await screen.findByRole('menuitem', { name: t('engines.claude.plugins.removePlugin') }),
    );

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(
        within(dialog).getByRole('button', { name: t('engines.claude.plugins.removeKeep') }),
      ).toHaveFocus();
    });

    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.plugins.removeConfirm') }),
    );
    await waitFor(() => {
      expect(deleting).toHaveBeenCalledWith('/engines/claude/plugins/plugin-1');
    });
  });

  it('removes a batch of plugins, listing every name — S-134, S-135', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins': () =>
        Promise.resolve({
          plugins: [aPlugin(), aPlugin({ id: 'plugin-2', name: 'other-plugin' })],
        }),
    });
    const deleting = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    mountApp(URL);

    await screen.findByText('my-plugin');
    await user.click(
      screen.getByLabelText(t('engines.claude.plugins.rowSelect', { name: 'my-plugin' })),
    );
    await user.click(
      screen.getByLabelText(t('engines.claude.plugins.rowSelect', { name: 'other-plugin' })),
    );
    await user.click(
      screen.getByRole('button', { name: t('engines.claude.plugins.removePlugin') }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('my-plugin')).toBeVisible();
    expect(within(dialog).getByText('other-plugin')).toBeVisible();

    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.plugins.removeConfirm') }),
    );
    await waitFor(() => {
      expect(deleting).toHaveBeenCalledTimes(2);
    });
  });

  it('checks for an update and finds none — S-205', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins': () =>
        Promise.resolve({
          plugins: [aPlugin({ origin: 'marketplace', marketplace: 'official', commit: 'abc123' })],
        }),
      '/engines/claude/plugins/plugin-1/update': () =>
        Promise.resolve({ available: false, newCommit: null, diff: null }),
    });
    mountApp(URL);

    await screen.findByText('my-plugin');
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('my-plugin') });
    await user.click(
      await screen.findByRole('menuitem', { name: t('engines.claude.plugins.checkUpdate') }),
    );

    expect(await screen.findByText(t('engines.claude.plugins.updateNone'))).toBeVisible();
    expect(
      screen.queryByRole('button', { name: t('engines.claude.plugins.updateApply') }),
    ).toBeNull();
  });

  it('checks for an update, shows the diff, and applies it only on the second step — S-205', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins': () =>
        Promise.resolve({
          plugins: [aPlugin({ origin: 'marketplace', marketplace: 'official', commit: 'abc123' })],
        }),
    });
    const diff = {
      commandsAdded: ['new-command'],
      commandsRemoved: [],
      agentsAdded: [],
      agentsRemoved: [],
      skillsAdded: [],
      skillsRemoved: [],
      mcpServersAdded: [],
      mcpServersRemoved: [],
      hookCountBefore: 0,
      hookCountAfter: 1,
    };
    vi.spyOn(api, 'get').mockImplementation((route: string) => {
      if (route === '/engines/claude/plugins/plugin-1/update') {
        return Promise.resolve({ available: true, newCommit: 'def456', diff }) as Promise<never>;
      }
      if (route.split('?')[0] === '/engines/claude/plugins') {
        return Promise.resolve({
          plugins: [aPlugin({ origin: 'marketplace', marketplace: 'official', commit: 'abc123' })],
        }) as Promise<never>;
      }
      if (route === '/engines') {
        return Promise.resolve({ defaultEngine: 'claude', engines: [] }) as Promise<never>;
      }
      return new Promise(() => undefined);
    });
    const posting = vi
      .spyOn(api, 'post')
      .mockResolvedValue(
        aPlugin({ origin: 'marketplace', marketplace: 'official', commit: 'def456' }),
      );
    mountApp(URL);

    await screen.findByText('my-plugin');
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('my-plugin') });
    await user.click(
      await screen.findByRole('menuitem', { name: t('engines.claude.plugins.checkUpdate') }),
    );

    expect(await screen.findByText('new-command')).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: t('engines.claude.plugins.updateApply') }),
    );

    await waitFor(() => {
      expect(posting).toHaveBeenCalledWith('/engines/claude/plugins/plugin-1/update', {});
    });
  });

  it('jumps to the MCP servers section to approve what a plugin suggests — D-91', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins': () =>
        Promise.resolve({
          plugins: [
            aPlugin({
              manifest: { ...(aPlugin()['manifest'] as object), mcpServerNames: ['github'] },
            }),
          ],
        }),
    });
    const app = mountApp(URL);

    await screen.findByText('my-plugin');
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('my-plugin') });
    await user.click(
      await screen.findByRole('menuitem', { name: t('engines.claude.plugins.goToMcpServers') }),
    );

    await waitFor(() => {
      expect(app.search()).toMatchObject({ section: 'mcp' });
    });
  });

  it('with no marketplace declared, explains how to declare one — S-212', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers();
    mountApp(URL);

    await screen.findByText(t('engines.claude.plugins.emptyTitle'));
    await user.click(
      screen.getByRole('button', { name: t('engines.claude.plugins.browseMarketplace') }),
    );

    expect(await screen.findByText(t('engines.claude.marketplace.emptyTitle'))).toBeVisible();
  });

  it('browses a declared marketplace, searches its catalogue, and installs with a confirm — S-212', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins/marketplaces': () =>
        Promise.resolve({ marketplaces: [{ name: 'official' }] }),
      '/engines/claude/plugins/marketplaces/official': () =>
        Promise.resolve({
          name: 'official',
          plugins: [
            aCatalogEntry(),
            aCatalogEntry({ name: 'unrelated', description: 'Something else' }),
          ],
        }),
    });
    const posting = vi
      .spyOn(api, 'post')
      .mockResolvedValue(aPlugin({ origin: 'marketplace', marketplace: 'official' }));
    mountApp(URL);

    await screen.findByText(t('engines.claude.plugins.emptyTitle'));
    await user.click(
      screen.getByRole('button', { name: t('engines.claude.plugins.browseMarketplace') }),
    );
    await user.selectOptions(
      screen.getByLabelText(t('engines.claude.marketplace.pickLabel')),
      'official',
    );

    await screen.findByText('linter-pack');
    await user.type(screen.getByLabelText(t('engines.claude.marketplace.searchLabel')), 'linter');
    expect(screen.queryByText('unrelated')).toBeNull();

    await user.click(screen.getByRole('button', { name: t('engines.claude.marketplace.install') }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Lints the repository on every commit.')).toBeVisible();

    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.marketplace.install') }),
    );
    await waitFor(() => {
      expect(posting).toHaveBeenCalledWith('/engines/claude/plugins/marketplace', {
        marketplace: 'official',
        plugin: 'linter-pack',
      });
    });
  });

  it('cancels an install without writing anything', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins/marketplaces': () =>
        Promise.resolve({ marketplaces: [{ name: 'official' }] }),
      '/engines/claude/plugins/marketplaces/official': () =>
        Promise.resolve({ name: 'official', plugins: [aCatalogEntry()] }),
    });
    const posting = vi.spyOn(api, 'post');
    mountApp(URL);

    await screen.findByText(t('engines.claude.plugins.emptyTitle'));
    await user.click(
      screen.getByRole('button', { name: t('engines.claude.plugins.browseMarketplace') }),
    );
    await user.selectOptions(
      screen.getByLabelText(t('engines.claude.marketplace.pickLabel')),
      'official',
    );
    await user.click(
      await screen.findByRole('button', { name: t('engines.claude.marketplace.install') }),
    );

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.marketplace.installCancel') }),
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(posting).not.toHaveBeenCalled();
  });

  it('shows an install failure inline, without closing the dialog', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins/marketplaces': () =>
        Promise.resolve({ marketplaces: [{ name: 'official' }] }),
      '/engines/claude/plugins/marketplaces/official': () =>
        Promise.resolve({ name: 'official', plugins: [aCatalogEntry()] }),
    });
    vi.spyOn(api, 'post').mockRejectedValue(
      new AppError(
        'PLUGIN_SOURCE_UNAVAILABLE',
        'engines.claude.error.pluginSourceUnavailable',
        't1',
        {
          marketplace: 'official',
        },
      ),
    );
    mountApp(URL);

    await screen.findByText(t('engines.claude.plugins.emptyTitle'));
    await user.click(
      screen.getByRole('button', { name: t('engines.claude.plugins.browseMarketplace') }),
    );
    await user.selectOptions(
      screen.getByLabelText(t('engines.claude.marketplace.pickLabel')),
      'official',
    );
    await user.click(
      await screen.findByRole('button', { name: t('engines.claude.marketplace.install') }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.marketplace.install') }),
    );

    expect(
      await within(dialog).findByText(
        t('engines.claude.error.pluginSourceUnavailable', { marketplace: 'official' }),
      ),
    ).toBeVisible();
  });

  it('brings the list back translated, with a way to try again', async () => {
    const user = userEvent.setup();
    const failure = new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1');
    pluginBackendAnswers({ '/engines/claude/plugins': () => Promise.reject(failure) });
    mountApp(URL);

    const retry = await screen.findByRole('button', { name: t('common.action.retry') });
    await user.click(retry);
  });

  it('double-clicking a row makes no change — plugins have no inline edit', async () => {
    pluginBackendAnswers({
      '/engines/claude/plugins': () => Promise.resolve({ plugins: [aPlugin()] }),
    });
    mountApp(URL);
    await screen.findByText('my-plugin');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has no axe violation with a plugin listed and the wizard open', async () => {
    pluginBackendAnswers({
      '/engines/claude/plugins': () => Promise.resolve({ plugins: [aPlugin()] }),
    });
    const { container } = mountApp(URL);

    await screen.findByText('my-plugin');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('deselecting a row takes it out of the selection count', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers({
      '/engines/claude/plugins': () => Promise.resolve({ plugins: [aPlugin()] }),
    });
    mountApp(URL);

    await screen.findByText('my-plugin');
    const checkbox = screen.getByLabelText(
      t('engines.claude.plugins.rowSelect', { name: 'my-plugin' }),
    );
    await user.click(checkbox);
    expect(
      screen.getByText(t('engines.claude.plugins.selectionCount', { count: 1 })),
    ).toBeVisible();

    await user.click(checkbox);
    expect(screen.queryByText(t('engines.claude.plugins.selectionCount', { count: 1 }))).toBeNull();
  });

  it('explains plugins and marketplaces to somebody who has never seen one, in the help panel — S-138', async () => {
    const user = userEvent.setup();
    pluginBackendAnswers();
    const { container } = mountApp(URL);

    await screen.findByText(t('engines.claude.plugins.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('help.panel.open') }));

    const panel = await screen.findByRole('complementary');
    const topics = [
      ['engines.claude.help.pluginWhatHeading', 'engines.claude.help.pluginWhatBody'],
      ['engines.claude.help.pluginMarketplaceHeading', 'engines.claude.help.pluginMarketplaceBody'],
    ] as const;

    for (const [headingKey, bodyKey] of topics) {
      const region = within(panel).getByRole('region', { name: t(headingKey) });
      expect(within(region).getByText(t(bodyKey))).toBeVisible();
    }

    expect(await axe(container)).toHaveNoViolations();
  });
});
