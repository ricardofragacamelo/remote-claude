import { Pencil, Plug, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { CommandDeclaration } from '@/features/commands';
import { goCommandOf } from '@/features/commands';
import type { McpServerMutations } from '../hooks/useMcpServerMutations';
import type { McpServerView } from '../types/mcp';

/** Where an action sits in the context menu of a row — there is only one group here today. */
export type McpServerActionGroup = 'row';

/** One thing this screen does with the servers in [targets]: the toolbar's, the row's, the palette's. */
export interface McpServerAction {
  readonly id: string;
  readonly labelKey: string;
  readonly icon: LucideIcon;
  readonly group?: McpServerActionGroup;
  available(): boolean;
  run(): void;
}

/** What the screen does for an action beyond calling a mutation — opening a dialog, mostly. */
export interface McpServerActionHandlers {
  onAdd(): void;
  onEdit(server: McpServerView): void;

  /** Opens the destructive confirm, with [targets] as what it would remove. */
  onRemove(targets: readonly McpServerView[]): void;
}

/**
 * Every action this screen offers on [targets] — the whole selection for the toolbar and the
 * palette, one row alone for its own context menu (plan 13, B-28): the same list feeds the three
 * surfaces (S-131, S-134, S-135, S-140), so a label, an icon or a shortcut never drifts between
 * them. A server refused in a bulk toggle or removal does not stop the others — the mutation itself
 * carries that guarantee (S-134); this list only decides whether the action is offered at all.
 */
export function mcpServerActions(
  targets: readonly McpServerView[],
  mutations: McpServerMutations,
  handlers: McpServerActionHandlers,
): readonly McpServerAction[] {
  const some = targets.length > 0;
  const one = targets.length === 1 ? targets[0] : undefined;
  const anyDisabled = targets.some((server) => !server.enabled);
  const anyEnabled = targets.some((server) => server.enabled);

  return [
    {
      id: 'mcp.addServer',
      labelKey: 'agentSettings.mcp.addServer',
      icon: Plus,
      available: () => true,
      run: handlers.onAdd,
    },
    {
      id: 'mcp.editServer',
      labelKey: 'agentSettings.mcp.editServer',
      icon: Pencil,
      group: 'row',
      available: () => one !== undefined,
      run: () => {
        if (one !== undefined) {
          handlers.onEdit(one);
        }
      },
    },
    {
      id: 'mcp.enableSelected',
      labelKey: 'agentSettings.mcp.turnOn',
      icon: Power,
      group: 'row',
      available: () => some && anyDisabled,
      run: () => {
        void mutations.setEnabled(targets, true);
      },
    },
    {
      id: 'mcp.disableSelected',
      labelKey: 'agentSettings.mcp.turnOff',
      icon: PowerOff,
      group: 'row',
      available: () => some && anyEnabled,
      run: () => {
        void mutations.setEnabled(targets, false);
      },
    },
    {
      id: 'mcp.testSelected',
      labelKey: 'agentSettings.mcp.testConnection',
      icon: Plug,
      group: 'row',
      available: () => some,
      run: () => {
        void mutations.test(targets);
      },
    },
    {
      id: 'mcp.removeSelected',
      labelKey: 'agentSettings.mcp.removeServer',
      icon: Trash2,
      group: 'row',
      available: () => some,
      run: () => {
        handlers.onRemove(targets);
      },
    },
  ];
}

/**
 * The two commands the plan names for the palette (plan 13, B-30's text; built here because B-28 is
 * the one that owns the action list they come from): adding a server, and testing every one of
 * them — never the row-scoped actions (editing or removing one server makes no sense from a palette
 * with nothing selected). `engine` is passed as `labelParams` so `{{agent}}` resolves the same way
 * every other command's label already does.
 */
export function asCommands(
  actions: readonly McpServerAction[],
  engine: string,
): CommandDeclaration[] {
  const wanted = new Set(['mcp.addServer', 'mcp.testSelected']);
  return actions
    .filter((action) => wanted.has(action.id))
    .map((action) => goCommandOf(action, { engine }));
}
