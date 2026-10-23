import { useTranslation } from 'react-i18next';

import { ContextMenuActionItems } from '@/shared/components/ContextMenuActionItems';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/shared/components/ui/context-menu';
import type { PluginActionHandlers } from '../lib/plugin-actions';
import { pluginActions } from '../lib/plugin-actions';
import { ORIGIN_KEYS, STATE_KEYS } from '../lib/status-words';
import type { PluginMutations } from '../hooks/usePluginMutations';
import type { PluginView } from '../types/plugin';

export interface PluginTableProps {
  readonly plugins: readonly PluginView[];
  readonly selected: ReadonlySet<string>;
  onToggleSelected(id: string): void;
  readonly mutations: PluginMutations;
  readonly handlers: PluginActionHandlers;
}

function bringsOf(plugin: PluginView): string {
  const manifest = plugin.manifest;
  if (manifest === null) {
    return '—';
  }

  return [
    `${String(manifest.commands.length)}c`,
    `${String(manifest.agents.length)}a`,
    `${String(manifest.skills.length)}s`,
    `${String(manifest.hookCount)}h`,
    `${String(manifest.mcpServerNames.length)}mcp`,
  ].join(' · ');
}

/**
 * The dense table of the caller's plugins (plan 13, B-29, S-137): name, origin, version, where it
 * comes from (path or commit), state and what it brings. The row's context menu offers the same
 * actions the toolbar and the palette do — the same structure `McpServerTable` already has.
 */
export function PluginTable({
  plugins,
  selected,
  onToggleSelected,
  mutations,
  handlers,
}: PluginTableProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-ui-sm">
        <caption className="sr-only">{t('engines.claude.plugins.tableCaption')}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="w-8 p-2">
              <span className="sr-only">{t('engines.claude.plugins.columnSelect')}</span>
            </th>
            <th className="p-2">{t('engines.claude.plugins.columnName')}</th>
            <th className="p-2">{t('engines.claude.plugins.columnOrigin')}</th>
            <th className="p-2">{t('engines.claude.plugins.columnVersion')}</th>
            <th className="p-2">{t('engines.claude.plugins.columnSource')}</th>
            <th className="p-2">{t('engines.claude.plugins.columnState')}</th>
            <th className="p-2">{t('engines.claude.plugins.columnBrings')}</th>
          </tr>
        </thead>
        <tbody>
          {plugins.map((plugin) => {
            const actions = pluginActions([plugin], mutations, handlers).filter(
              (action) => action.group === 'row',
            );

            return (
              <PluginRow
                key={plugin.id}
                plugin={plugin}
                selected={selected.has(plugin.id)}
                onToggleSelected={onToggleSelected}
                actions={actions}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface PluginRowProps {
  readonly plugin: PluginView;
  readonly selected: boolean;
  onToggleSelected(id: string): void;
  readonly actions: ReturnType<typeof pluginActions>;
}

function PluginRow({
  plugin,
  selected,
  onToggleSelected,
  actions,
}: PluginRowProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <tr className="border-b border-border last:border-b-0 hover:bg-accent/50">
          <td className="p-2">
            <input
              type="checkbox"
              aria-label={t('engines.claude.plugins.rowSelect', { name: plugin.name })}
              checked={selected}
              onChange={() => {
                onToggleSelected(plugin.id);
              }}
            />
          </td>
          <td className="p-2 font-ui-strong">{plugin.name}</td>
          <td className="p-2">{t(ORIGIN_KEYS[plugin.origin])}</td>
          <td className="p-2">{plugin.manifest?.version ?? '—'}</td>
          <td className="p-2 font-code text-ui-xs">
            {plugin.origin === 'local' ? plugin.path : (plugin.commit ?? '—')}
          </td>
          <td className="p-2">{t(STATE_KEYS[plugin.state])}</td>
          <td className="p-2 font-code text-ui-xs">{bringsOf(plugin)}</td>
        </tr>
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label={t('engines.claude.plugins.rowMenuLabel', { name: plugin.name })}
      >
        <ContextMenuActionItems
          actions={actions.map((action) => ({ ...action, disabled: !action.available() }))}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
