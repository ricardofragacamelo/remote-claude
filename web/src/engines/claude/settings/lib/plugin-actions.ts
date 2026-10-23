import { FolderPlus, Plug, Power, PowerOff, RefreshCw, Store, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { goCommandOf } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import type { PluginMutations } from '../hooks/usePluginMutations';
import type { PluginView } from '../types/plugin';

/** Where an action sits in the context menu / row of this screen — one group, like `mcp`'s own. */
export type PluginActionGroup = 'row';

/** One thing this screen does with the plugins in [targets]: the toolbar's, the row's, the palette's. */
export interface PluginAction {
  readonly id: string;
  readonly labelKey: string;
  readonly icon: LucideIcon;
  readonly group?: PluginActionGroup;
  available(): boolean;
  run(): void;
}

/** What the screen does for an action beyond calling a mutation — opening a dialog, mostly. */
export interface PluginActionHandlers {
  onAddLocal(): void;
  onBrowseMarketplace(): void;
  onCheckUpdate(plugin: PluginView): void;
  onRemove(targets: readonly PluginView[]): void;

  /** Jumps to the MCP servers section, to approve the servers this plugin suggests (D-91). */
  onGoToMcpServers(plugin: PluginView): void;
}

/** One entry of the row group — built by {@link row} so the shape is written once in this file. */
function row(
  id: string,
  labelKey: string,
  icon: LucideIcon,
  available: () => boolean,
  run: () => void,
): PluginAction {
  return { id, labelKey, icon, group: 'row', available, run };
}

/**
 * Every action this screen offers on [targets] — the whole selection for the toolbar and the
 * palette, one row alone for its own context menu (plan 13, B-29) — the same list feeds every
 * surface, mirroring `mcpServerActions`' own reasoning: a label, an icon or a shortcut never drifts
 * between the toolbar, the row and the palette. A plugin refused in a bulk toggle or removal does
 * not stop the others — the mutation itself carries that guarantee; this list only decides whether
 * the action is offered at all.
 */
export function pluginActions(
  targets: readonly PluginView[],
  mutations: PluginMutations,
  handlers: PluginActionHandlers,
): readonly PluginAction[] {
  const some = targets.length > 0;
  const one = targets.length === 1 ? targets[0] : undefined;
  const anyDisabled = targets.some((plugin) => !plugin.enabled);
  const anyEnabled = targets.some((plugin) => plugin.enabled);
  const suggestsMcp = one !== undefined && (one.manifest?.mcpServerNames.length ?? 0) > 0;

  return [
    {
      id: 'plugin.addLocal',
      labelKey: 'engines.claude.plugins.addLocal',
      icon: FolderPlus,
      available: () => true,
      run: handlers.onAddLocal,
    },
    {
      id: 'plugin.browseMarketplace',
      labelKey: 'engines.claude.plugins.browseMarketplace',
      icon: Store,
      available: () => true,
      run: handlers.onBrowseMarketplace,
    },
    row(
      'plugin.enableSelected',
      'engines.claude.plugins.turnOn',
      Power,
      () => some && anyDisabled,
      () => {
        void mutations.setEnabled(targets, true);
      },
    ),
    row(
      'plugin.disableSelected',
      'engines.claude.plugins.turnOff',
      PowerOff,
      () => some && anyEnabled,
      () => {
        void mutations.setEnabled(targets, false);
      },
    ),
    row(
      'plugin.checkUpdate',
      'engines.claude.plugins.checkUpdate',
      RefreshCw,
      () => one !== undefined && one.origin === 'marketplace',
      () => {
        if (one !== undefined) {
          handlers.onCheckUpdate(one);
        }
      },
    ),
    row(
      'plugin.goToMcpServers',
      'engines.claude.plugins.goToMcpServers',
      Plug,
      () => suggestsMcp,
      () => {
        if (one !== undefined) {
          handlers.onGoToMcpServers(one);
        }
      },
    ),
    row(
      'plugin.removeSelected',
      'engines.claude.plugins.removePlugin',
      Trash2,
      () => some,
      () => {
        handlers.onRemove(targets);
      },
    ),
  ];
}

/**
 * The two commands worth a palette entry (plan 13, B-29's text: "add plugin" / "browse
 * marketplace") — never the row-scoped actions (toggling or removing makes no sense from a palette
 * with nothing selected), mirroring `mcp`'s own `asCommands`.
 */
export function asCommands(actions: readonly PluginAction[], engine: string): CommandDeclaration[] {
  const wanted = new Set(['plugin.addLocal', 'plugin.browseMarketplace']);
  return actions
    .filter((action) => wanted.has(action.id))
    .map((action) => goCommandOf(action, { engine }));
}
