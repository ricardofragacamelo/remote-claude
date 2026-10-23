import { describe, expect, it, vi } from 'vitest';

import { asCommands, mcpServerActions } from '@/features/mcp/lib/mcp-server-actions';
import type { McpServerActionHandlers } from '@/features/mcp/lib/mcp-server-actions';
import type { McpServerMutations } from '@/features/mcp/hooks/useMcpServerMutations';
import type { McpServerView } from '@/features/mcp/types/mcp';

function aServer(overrides: Partial<McpServerView> = {}): McpServerView {
  return {
    id: 's1',
    name: 'github',
    scope: 'user',
    folderPath: null,
    transport: 'stdio',
    command: 'npx',
    args: [],
    envNames: [],
    url: null,
    headerNames: [],
    enabled: true,
    status: 'pending',
    createdAt: '2026-10-19T12:00:00.000Z',
    updatedAt: '2026-10-19T12:00:00.000Z',
    ...overrides,
  };
}

function mutationsOf(): McpServerMutations {
  return {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setEnabled: vi.fn().mockResolvedValue([]),
    removeMany: vi.fn().mockResolvedValue([]),
    test: vi.fn().mockResolvedValue(undefined),
    testResults: new Map(),
    clearTestResults: vi.fn(),
    saving: false,
    saveError: null,
  };
}

function handlersOf(): McpServerActionHandlers {
  return { onAdd: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn() };
}

function actionOf(actions: ReturnType<typeof mcpServerActions>, id: string) {
  const action = actions.find((entry) => entry.id === id);
  if (action === undefined) {
    throw new Error(`no action named ${id}`);
  }
  return action;
}

describe('mcpServerActions — plan 13, B-28', () => {
  it('"add" is always available, and opens the wizard with nothing to edit', () => {
    const handlers = handlersOf();
    const add = actionOf(mcpServerActions([], mutationsOf(), handlers), 'mcp.addServer');

    expect(add.available()).toBe(true);
    add.run();
    expect(handlers.onAdd).toHaveBeenCalled();
  });

  it('"edit" is available only with exactly one target, and names it', () => {
    const handlers = handlersOf();
    const one = aServer();
    const single = mcpServerActions([one], mutationsOf(), handlers);
    const none = mcpServerActions([], mutationsOf(), handlers);
    const two = mcpServerActions([one, aServer({ id: 's2' })], mutationsOf(), handlers);

    expect(actionOf(single, 'mcp.editServer').available()).toBe(true);
    expect(actionOf(none, 'mcp.editServer').available()).toBe(false);
    expect(actionOf(two, 'mcp.editServer').available()).toBe(false);

    actionOf(single, 'mcp.editServer').run();
    expect(handlers.onEdit).toHaveBeenCalledWith(one);
  });

  it('"edit" run does nothing with no target or more than one — never half-opens the wizard', () => {
    const handlers = handlersOf();
    const one = aServer();

    actionOf(mcpServerActions([], mutationsOf(), handlers), 'mcp.editServer').run();
    actionOf(
      mcpServerActions([one, aServer({ id: 's2' })], mutationsOf(), handlers),
      'mcp.editServer',
    ).run();

    expect(handlers.onEdit).not.toHaveBeenCalled();
  });

  it('"turn on" is available only when some target is disabled, and turns every target on', () => {
    const mutations = mutationsOf();
    const disabled = aServer({ enabled: false });
    const actions = mcpServerActions([disabled], mutations, handlersOf());

    expect(actionOf(actions, 'mcp.enableSelected').available()).toBe(true);
    actionOf(actions, 'mcp.enableSelected').run();
    expect(mutations.setEnabled).toHaveBeenCalledWith([disabled], true);

    const allEnabled = mcpServerActions([aServer()], mutationsOf(), handlersOf());
    expect(actionOf(allEnabled, 'mcp.enableSelected').available()).toBe(false);
  });

  it('"turn off" is available only when some target is enabled, and turns every target off', () => {
    const mutations = mutationsOf();
    const enabled = aServer();
    const actions = mcpServerActions([enabled], mutations, handlersOf());

    expect(actionOf(actions, 'mcp.disableSelected').available()).toBe(true);
    actionOf(actions, 'mcp.disableSelected').run();
    expect(mutations.setEnabled).toHaveBeenCalledWith([enabled], false);

    const allDisabled = mcpServerActions(
      [aServer({ enabled: false })],
      mutationsOf(),
      handlersOf(),
    );
    expect(actionOf(allDisabled, 'mcp.disableSelected').available()).toBe(false);
  });

  it('"test" is available with at least one target, and tests every one of them', () => {
    const mutations = mutationsOf();
    const server = aServer();
    const actions = mcpServerActions([server], mutations, handlersOf());

    expect(actionOf(actions, 'mcp.testSelected').available()).toBe(true);
    actionOf(actions, 'mcp.testSelected').run();
    expect(mutations.test).toHaveBeenCalledWith([server]);

    expect(
      actionOf(mcpServerActions([], mutations, handlersOf()), 'mcp.testSelected').available(),
    ).toBe(false);
  });

  it('"remove" opens the confirm with every target, never removing directly', () => {
    const mutations = mutationsOf();
    const handlers = handlersOf();
    const server = aServer();
    const actions = mcpServerActions([server], mutations, handlers);

    expect(actionOf(actions, 'mcp.removeSelected').available()).toBe(true);
    actionOf(actions, 'mcp.removeSelected').run();

    expect(handlers.onRemove).toHaveBeenCalledWith([server]);
    expect(mutations.removeMany).not.toHaveBeenCalled();
  });
});

describe('asCommands', () => {
  it('keeps only "add" and "test", with the engine as labelParams so {{agent}} resolves', () => {
    const actions = mcpServerActions([aServer()], mutationsOf(), handlersOf());
    const commands = asCommands(actions, 'claude');

    expect(commands.map((command) => command.id).sort()).toEqual(
      ['mcp.addServer', 'mcp.testSelected'].sort(),
    );
    expect(commands.every((command) => command.category === 'go')).toBe(true);
    expect(commands.every((command) => command.labelParams?.['engine'] === 'claude')).toBe(true);
  });

  it('runs and reads availability straight from the underlying action', () => {
    const mutations = mutationsOf();
    const actions = mcpServerActions([aServer()], mutations, handlersOf());
    const commands = asCommands(actions, 'claude');
    const test = commands.find((command) => command.id === 'mcp.testSelected');

    expect(test?.when?.()).toBe(true);
    void test?.run();
    expect(mutations.test).toHaveBeenCalled();
  });
});
