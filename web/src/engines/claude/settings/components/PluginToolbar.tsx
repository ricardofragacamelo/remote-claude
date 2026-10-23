import { useTranslation } from 'react-i18next';

import { useCommands } from '@/features/commands';
import { Button } from '@/shared/components/ui/button';
import type { SelectionBarKeys } from '@/shared/components/SelectionActionBar';
import { SelectionActionBar } from '@/shared/components/SelectionActionBar';
import { SearchField } from '@/shared/components/SearchField';
import type { PluginMutations } from '../hooks/usePluginMutations';
import type { PluginActionHandlers } from '../lib/plugin-actions';
import { asCommands, pluginActions } from '../lib/plugin-actions';
import type { PluginView } from '../types/plugin';

/** The i18n keys of this toolbar's own selection bar — declared once, outside any JSX. */
const SELECTION_KEYS: SelectionBarKeys = {
  ariaLabel: 'engines.claude.plugins.selectionLabel',
  count: 'engines.claude.plugins.selectionCount',
};

export interface PluginToolbarProps {
  readonly engine: string;

  /** Every plugin of the store — what the palette's "add"/"browse marketplace" commands act beside. */
  readonly plugins: readonly PluginView[];
  readonly selectedPlugins: readonly PluginView[];
  readonly search: string;
  onSearchChange(search: string): void;
  readonly mutations: PluginMutations;
  readonly handlers: PluginActionHandlers;
}

/**
 * Search, "Add local plugin", "Browse marketplace", and the bulk actions of the current selection —
 * the same action list the row's context menu and the palette use, mirroring `McpToolbar`'s own
 * reasoning (plan 13, B-29, S-137, S-212).
 */
export function PluginToolbar({
  engine,
  plugins,
  selectedPlugins,
  search,
  onSearchChange,
  mutations,
  handlers,
}: PluginToolbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const bulkActions = pluginActions(selectedPlugins, mutations, handlers).filter(
    (action) => action.group === 'row' && action.id !== 'plugin.checkUpdate',
  );
  useCommands(asCommands(pluginActions(plugins, mutations, handlers), engine));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Button onClick={handlers.onAddLocal} title={t('engines.claude.plugins.addLocal')}>
          {t('engines.claude.plugins.addLocal')}
        </Button>
        <Button
          variant="outline"
          onClick={handlers.onBrowseMarketplace}
          title={t('engines.claude.plugins.browseMarketplace')}
        >
          {t('engines.claude.plugins.browseMarketplace')}
        </Button>
        <SearchField
          label={t('engines.claude.plugins.searchLabel')}
          value={search}
          onChange={onSearchChange}
        />
      </div>

      <SelectionActionBar
        count={selectedPlugins.length}
        keys={SELECTION_KEYS}
        actions={bulkActions}
      />
    </div>
  );
}
