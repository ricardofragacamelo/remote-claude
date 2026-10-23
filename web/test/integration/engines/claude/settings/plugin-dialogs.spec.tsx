import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AddLocalPluginDialog } from '@/engines/claude/settings/components/AddLocalPluginDialog';
import { PluginUpdateDialog } from '@/engines/claude/settings/components/PluginUpdateDialog';
import { MarketplaceBrowser } from '@/engines/claude/settings/components/MarketplaceBrowser';
import { PluginTable } from '@/engines/claude/settings/components/PluginTable';
import type { AddLocalPluginFlow } from '@/engines/claude/settings/hooks/useAddLocalPluginFlow';
import type { PluginUpdateFlow } from '@/engines/claude/settings/hooks/usePluginUpdateFlow';
import type { Marketplaces } from '@/engines/claude/settings/hooks/useMarketplaces';
import type { MarketplaceCatalog } from '@/engines/claude/settings/hooks/useMarketplaceCatalog';
import type { PluginMutations } from '@/engines/claude/settings/hooks/usePluginMutations';
import type { PluginActionHandlers } from '@/engines/claude/settings/lib/plugin-actions';
import type { PluginView } from '@/engines/claude/settings/types/plugin';
import { AppError } from '@/shared/api/errors';
import { render, translator } from '../../../../support/render';

const t = translator('en');

const PLUGIN: PluginView = {
  id: 'p1',
  origin: 'marketplace',
  path: '/srv/plugins/linter-pack',
  marketplace: 'official',
  commit: 'abc123',
  name: 'linter-pack',
  state: 'current',
  enabled: true,
  manifest: null,
  createdAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
};

describe('PluginUpdateDialog — plan 13, B-47, B-29, S-205, edge states', () => {
  it('shows the error of a failed check, with no apply button', () => {
    const flow: PluginUpdateFlow = {
      state: {
        plugin: PLUGIN,
        checking: false,
        check: null,
        applying: false,
        error: new AppError('FORBIDDEN', 'common.error.forbidden', 't1'),
      },
      check: vi.fn(),
      apply: vi.fn(),
      cancel: vi.fn(),
    };
    render(<PluginUpdateDialog flow={flow} />);

    expect(screen.getByText(t('common.error.forbidden'))).toBeVisible();
    expect(
      screen.queryByRole('button', { name: t('engines.claude.plugins.updateApply') }),
    ).toBeNull();
  });

  it('available with no diff to show says so, but can still be applied', () => {
    const flow: PluginUpdateFlow = {
      state: {
        plugin: PLUGIN,
        checking: false,
        check: { available: true, newCommit: 'def456', diff: null },
        applying: false,
        error: null,
      },
      check: vi.fn(),
      apply: vi.fn(),
      cancel: vi.fn(),
    };
    render(<PluginUpdateDialog flow={flow} />);

    expect(screen.getByText(t('engines.claude.plugins.updateAvailableNoDiff'))).toBeVisible();
    expect(
      screen.getByRole('button', { name: t('engines.claude.plugins.updateApply') }),
    ).toBeEnabled();
  });

  it('shows "Applying…" while the apply write is in flight', () => {
    const flow: PluginUpdateFlow = {
      state: {
        plugin: PLUGIN,
        checking: false,
        check: {
          available: true,
          newCommit: 'def456',
          diff: {
            commandsAdded: [],
            commandsRemoved: [],
            agentsAdded: [],
            agentsRemoved: [],
            skillsAdded: [],
            skillsRemoved: [],
            mcpServersAdded: [],
            mcpServersRemoved: [],
            hookCountBefore: 0,
            hookCountAfter: 0,
          },
        },
        applying: true,
        error: null,
      },
      check: vi.fn(),
      apply: vi.fn(),
      cancel: vi.fn(),
    };
    render(<PluginUpdateDialog flow={flow} />);

    expect(
      screen.getByRole('button', { name: t('engines.claude.plugins.updateApplying') }),
    ).toBeDisabled();
  });

  it('closed (nothing checked yet) shows nothing', () => {
    const flow: PluginUpdateFlow = { state: null, check: vi.fn(), apply: vi.fn(), cancel: vi.fn() };
    render(<PluginUpdateDialog flow={flow} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AddLocalPluginDialog — plan 13, B-29, S-125, edge states', () => {
  it('shows the previewError on the form step when the manifest cannot be read', () => {
    const flow: AddLocalPluginFlow = {
      state: {
        step: 'form',
        path: '/srv/app',
        pathIssue: null,
        preview: null,
        saving: false,
        saveError: null,
        previewing: false,
        previewError: new AppError(
          'PLUGIN_PATH_INVALID',
          'engines.claude.error.pluginPathInvalid',
          't1',
          { reason: 'no manifest' },
        ),
      },
      start: vi.fn(),
      setPath: vi.fn(),
      toPreview: vi.fn(),
      back: vi.fn(),
      confirm: vi.fn(),
      cancel: vi.fn(),
    };
    render(<AddLocalPluginDialog flow={flow} />);

    expect(
      screen.getByText(t('engines.claude.error.pluginPathInvalid', { reason: 'no manifest' })),
    ).toBeVisible();
  });

  it('shows the saveError on the preview step when adding the plugin fails', () => {
    const flow: AddLocalPluginFlow = {
      state: {
        step: 'preview',
        path: '/srv/app',
        pathIssue: null,
        preview: {
          manifest: {
            name: 'my-plugin',
            description: null,
            version: null,
            commands: [],
            agents: [],
            hookCount: 0,
            skills: [],
            mcpServerNames: [],
          },
          messageKey: 'engines.claude.plugin.descriptionLocal',
          params: { name: 'my-plugin' },
        },
        saving: false,
        saveError: new AppError(
          'PLUGIN_PATH_INVALID',
          'engines.claude.error.pluginPathInvalid',
          't1',
          { reason: 'escapes the repository' },
        ),
        previewing: false,
        previewError: null,
      },
      start: vi.fn(),
      setPath: vi.fn(),
      toPreview: vi.fn(),
      back: vi.fn(),
      confirm: vi.fn(),
      cancel: vi.fn(),
    };
    render(<AddLocalPluginDialog flow={flow} />);

    expect(
      screen.getByText(
        t('engines.claude.error.pluginPathInvalid', { reason: 'escapes the repository' }),
      ),
    ).toBeVisible();
  });

  it('closed (nothing started yet) shows nothing', () => {
    const flow: AddLocalPluginFlow = {
      state: null,
      start: vi.fn(),
      setPath: vi.fn(),
      toPreview: vi.fn(),
      back: vi.fn(),
      confirm: vi.fn(),
      cancel: vi.fn(),
    };
    render(<AddLocalPluginDialog flow={flow} />);

    expect(screen.queryByRole('dialog', { name: t('engines.claude.plugins.addLocal') })).toBeNull();
  });
});

describe('MarketplaceBrowser — plan 13, B-47, B-29, S-212, edge states', () => {
  function marketplacesOf(overrides: Partial<Marketplaces> = {}): Marketplaces {
    return { names: ['official'], isLoading: false, error: null, retry: vi.fn(), ...overrides };
  }

  function catalogOf(overrides: Partial<MarketplaceCatalog> = {}): MarketplaceCatalog {
    return {
      plugins: [{ name: 'linter-pack', description: null, supported: false }],
      isLoading: false,
      error: null,
      retry: vi.fn(),
      ...overrides,
    };
  }

  it('an entry whose own source is unsupported is listed, warned, and cannot be installed', () => {
    render(
      <MarketplaceBrowser
        marketplaces={marketplacesOf()}
        selected="official"
        onSelect={vi.fn()}
        catalog={catalogOf()}
        search=""
        onSearchChange={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(screen.getByText(t('engines.claude.marketplace.unsupported'))).toBeVisible();
    expect(
      screen.getByRole('button', { name: t('engines.claude.marketplace.install') }),
    ).toBeDisabled();
  });

  it('a search matching nothing in the catalogue says so', () => {
    render(
      <MarketplaceBrowser
        marketplaces={marketplacesOf()}
        selected="official"
        onSelect={vi.fn()}
        catalog={catalogOf({
          plugins: [{ name: 'linter-pack', description: 'Lints.', supported: true }],
        })}
        search="nothing-matches"
        onSearchChange={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(screen.getByText(t('engines.claude.marketplace.catalogEmptyTitle'))).toBeVisible();
  });

  it('a catalogue read failure shows the error, with a way to retry', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const failure = new AppError(
      'PLUGIN_MARKETPLACE_NOT_ALLOWED',
      'engines.claude.error.pluginMarketplaceNotAllowed',
      't1',
    );
    render(
      <MarketplaceBrowser
        marketplaces={marketplacesOf()}
        selected="official"
        onSelect={vi.fn()}
        catalog={catalogOf({ error: failure, plugins: [], retry })}
        search=""
        onSearchChange={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(retry).toHaveBeenCalled();
  });

  it('a marketplaces read failure shows the error', () => {
    const failure = new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1');
    render(
      <MarketplaceBrowser
        marketplaces={marketplacesOf({ error: failure, names: [] })}
        selected={null}
        onSelect={vi.fn()}
        catalog={catalogOf({ plugins: [] })}
        search=""
        onSearchChange={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(screen.getByText(t('common.error.unexpected'))).toBeVisible();
  });
});

describe('PluginTable — plan 13, B-29, edge states', () => {
  function mutationsOf(): PluginMutations {
    return {
      addLocal: vi.fn(),
      installFromMarketplace: vi.fn(),
      setEnabled: vi.fn(),
      removeMany: vi.fn(),
      applyUpdate: vi.fn(),
      saving: false,
      saveError: null,
    };
  }

  function handlersOf(): PluginActionHandlers {
    return {
      onAddLocal: vi.fn(),
      onBrowseMarketplace: vi.fn(),
      onCheckUpdate: vi.fn(),
      onRemove: vi.fn(),
      onGoToMcpServers: vi.fn(),
    };
  }

  it('a plugin with no manifest, no commit shows "—" for version, source and what it brings', () => {
    const plugin: PluginView = { ...PLUGIN, manifest: null, commit: null };
    render(
      <PluginTable
        plugins={[plugin]}
        selected={new Set()}
        onToggleSelected={vi.fn()}
        mutations={mutationsOf()}
        handlers={handlersOf()}
      />,
    );

    const row = screen.getByText('linter-pack').closest('tr') as HTMLElement;
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('a selected row shows checked, a local plugin shows its path as the source', () => {
    const plugin: PluginView = { ...PLUGIN, origin: 'local', path: '/srv/app/.claude/plugins/x' };
    render(
      <PluginTable
        plugins={[plugin]}
        selected={new Set(['p1'])}
        onToggleSelected={vi.fn()}
        mutations={mutationsOf()}
        handlers={handlersOf()}
      />,
    );

    expect(
      screen.getByLabelText(t('engines.claude.plugins.rowSelect', { name: 'linter-pack' })),
    ).toBeChecked();
    expect(screen.getByText('/srv/app/.claude/plugins/x')).toBeVisible();
  });
});
