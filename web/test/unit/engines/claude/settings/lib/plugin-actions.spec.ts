import { describe, expect, it, vi } from 'vitest';

import { asCommands, pluginActions } from '@/engines/claude/settings/lib/plugin-actions';
import type { PluginActionHandlers } from '@/engines/claude/settings/lib/plugin-actions';
import type { PluginMutations } from '@/engines/claude/settings/hooks/usePluginMutations';
import type { PluginView } from '@/engines/claude/settings/types/plugin';

function aPlugin(overrides: Partial<PluginView> = {}): PluginView {
  return {
    id: 'p1',
    origin: 'local',
    path: '/srv/app',
    marketplace: null,
    commit: null,
    name: 'my-plugin',
    state: 'current',
    enabled: true,
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
    createdAt: '2026-10-19T12:00:00.000Z',
    updatedAt: '2026-10-19T12:00:00.000Z',
    ...overrides,
  };
}

function mutationsOf(): PluginMutations {
  return {
    addLocal: vi.fn(),
    installFromMarketplace: vi.fn(),
    setEnabled: vi.fn().mockResolvedValue([]),
    removeMany: vi.fn().mockResolvedValue([]),
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

function actionOf(actions: ReturnType<typeof pluginActions>, id: string) {
  const action = actions.find((entry) => entry.id === id);
  if (action === undefined) {
    throw new Error(`no action named ${id}`);
  }
  return action;
}

describe('pluginActions — plan 13, B-29', () => {
  it('"add local" and "browse marketplace" are always available', () => {
    const handlers = handlersOf();
    const actions = pluginActions([], mutationsOf(), handlers);

    expect(actionOf(actions, 'plugin.addLocal').available()).toBe(true);
    actionOf(actions, 'plugin.addLocal').run();
    expect(handlers.onAddLocal).toHaveBeenCalled();

    expect(actionOf(actions, 'plugin.browseMarketplace').available()).toBe(true);
    actionOf(actions, 'plugin.browseMarketplace').run();
    expect(handlers.onBrowseMarketplace).toHaveBeenCalled();
  });

  it('"turn on" is available only when some target is disabled, and turns every target on', () => {
    const mutations = mutationsOf();
    const disabled = aPlugin({ enabled: false });
    const actions = pluginActions([disabled], mutations, handlersOf());

    expect(actionOf(actions, 'plugin.enableSelected').available()).toBe(true);
    actionOf(actions, 'plugin.enableSelected').run();
    expect(mutations.setEnabled).toHaveBeenCalledWith([disabled], true);

    const allEnabled = pluginActions([aPlugin()], mutationsOf(), handlersOf());
    expect(actionOf(allEnabled, 'plugin.enableSelected').available()).toBe(false);
  });

  it('"turn off" is available only when some target is enabled, and turns every target off', () => {
    const mutations = mutationsOf();
    const enabled = aPlugin();
    const actions = pluginActions([enabled], mutations, handlersOf());

    expect(actionOf(actions, 'plugin.disableSelected').available()).toBe(true);
    actionOf(actions, 'plugin.disableSelected').run();
    expect(mutations.setEnabled).toHaveBeenCalledWith([enabled], false);

    const allDisabled = pluginActions([aPlugin({ enabled: false })], mutationsOf(), handlersOf());
    expect(actionOf(allDisabled, 'plugin.disableSelected').available()).toBe(false);
  });

  it('"check update" is available only for exactly one marketplace plugin', () => {
    const handlers = handlersOf();
    const marketplace = aPlugin({ origin: 'marketplace' });
    const local = aPlugin();

    expect(
      actionOf(
        pluginActions([marketplace], mutationsOf(), handlers),
        'plugin.checkUpdate',
      ).available(),
    ).toBe(true);
    expect(
      actionOf(pluginActions([local], mutationsOf(), handlers), 'plugin.checkUpdate').available(),
    ).toBe(false);
    expect(
      actionOf(pluginActions([], mutationsOf(), handlers), 'plugin.checkUpdate').available(),
    ).toBe(false);
    expect(
      actionOf(
        pluginActions([marketplace, local], mutationsOf(), handlers),
        'plugin.checkUpdate',
      ).available(),
    ).toBe(false);

    actionOf(pluginActions([marketplace], mutationsOf(), handlers), 'plugin.checkUpdate').run();
    expect(handlers.onCheckUpdate).toHaveBeenCalledWith(marketplace);
  });

  it('"go to MCP servers" is available only with exactly one target that suggests one — D-91', () => {
    const handlers = handlersOf();
    const suggesting = aPlugin({
      manifest: {
        name: 'my-plugin',
        description: null,
        version: null,
        commands: [],
        agents: [],
        hookCount: 0,
        skills: [],
        mcpServerNames: ['github'],
      },
    });
    const notSuggesting = aPlugin();

    expect(
      actionOf(
        pluginActions([suggesting], mutationsOf(), handlers),
        'plugin.goToMcpServers',
      ).available(),
    ).toBe(true);
    expect(
      actionOf(
        pluginActions([notSuggesting], mutationsOf(), handlers),
        'plugin.goToMcpServers',
      ).available(),
    ).toBe(false);
    expect(
      actionOf(
        pluginActions([aPlugin({ manifest: null })], mutationsOf(), handlers),
        'plugin.goToMcpServers',
      ).available(),
    ).toBe(false);

    actionOf(pluginActions([suggesting], mutationsOf(), handlers), 'plugin.goToMcpServers').run();
    expect(handlers.onGoToMcpServers).toHaveBeenCalledWith(suggesting);
  });

  it('"go to MCP servers" run does nothing with more than one target', () => {
    const handlers = handlersOf();
    const one = aPlugin();
    const two = aPlugin({ id: 'p2' });

    actionOf(pluginActions([one, two], mutationsOf(), handlers), 'plugin.goToMcpServers').run();

    expect(handlers.onGoToMcpServers).not.toHaveBeenCalled();
  });

  it('"remove" opens the confirm with every target, never removing directly', () => {
    const mutations = mutationsOf();
    const handlers = handlersOf();
    const plugin = aPlugin();
    const actions = pluginActions([plugin], mutations, handlers);

    expect(actionOf(actions, 'plugin.removeSelected').available()).toBe(true);
    actionOf(actions, 'plugin.removeSelected').run();

    expect(handlers.onRemove).toHaveBeenCalledWith([plugin]);
    expect(mutations.removeMany).not.toHaveBeenCalled();
  });

  it('"remove" is unavailable with nothing selected', () => {
    expect(
      actionOf(pluginActions([], mutationsOf(), handlersOf()), 'plugin.removeSelected').available(),
    ).toBe(false);
  });
});

describe('asCommands', () => {
  it('keeps only "add local" and "browse marketplace", with the engine as labelParams', () => {
    const actions = pluginActions([aPlugin()], mutationsOf(), handlersOf());
    const commands = asCommands(actions, 'claude');

    expect(commands.map((command) => command.id).sort()).toEqual(
      ['plugin.addLocal', 'plugin.browseMarketplace'].sort(),
    );
    expect(commands.every((command) => command.category === 'go')).toBe(true);
    expect(commands.every((command) => command.labelParams?.['engine'] === 'claude')).toBe(true);
  });

  it('runs and reads availability straight from the underlying action', () => {
    const handlers = handlersOf();
    const actions = pluginActions([aPlugin()], mutationsOf(), handlers);
    const commands = asCommands(actions, 'claude');
    const addLocal = commands.find((command) => command.id === 'plugin.addLocal');

    expect(addLocal?.when?.()).toBe(true);
    void addLocal?.run();
    expect(handlers.onAddLocal).toHaveBeenCalled();
  });
});
