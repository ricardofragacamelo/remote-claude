import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SectionBodyProps } from '@/features/agent-settings';
import { useSelection } from '@/shared/hooks/useSelection';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadStatus } from '@/shared/components/LoadStatus';
import { useAddLocalPluginFlow } from '../hooks/useAddLocalPluginFlow';
import { useInstallMarketplaceFlow } from '../hooks/useInstallMarketplaceFlow';
import { useMarketplaceCatalog } from '../hooks/useMarketplaceCatalog';
import { useMarketplaces } from '../hooks/useMarketplaces';
import { usePluginMutations } from '../hooks/usePluginMutations';
import { usePlugins } from '../hooks/usePlugins';
import { usePluginUpdateFlow } from '../hooks/usePluginUpdateFlow';
import { useRemovePluginFlow } from '../hooks/useRemovePluginFlow';
import type { PluginActionHandlers } from '../lib/plugin-actions';
import type { PluginView } from '../types/plugin';
import { AddLocalPluginDialog } from './AddLocalPluginDialog';
import { InstallMarketplacePluginDialog } from './InstallMarketplacePluginDialog';
import { MarketplaceBrowser } from './MarketplaceBrowser';
import { PluginTable } from './PluginTable';
import { PluginToolbar } from './PluginToolbar';
import { PluginUpdateDialog } from './PluginUpdateDialog';
import { RemovePluginDialog } from './RemovePluginDialog';

function visiblePlugins(plugins: readonly PluginView[], search: string): readonly PluginView[] {
  const query = search.trim().toLowerCase();
  const filtered = plugins.filter(
    (plugin) => query === '' || plugin.name.toLowerCase().includes(query),
  );

  return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * "Plugins": the caller's plugins — local and from a marketplace — with what each brings and its
 * state, adding by folder (through the folder-browse dialog, never a typed path) or from a declared
 * marketplace, with the prévia before anything is written (plan 13, B-29, S-137, S-212).
 */
export function PluginsSection({
  engine,
  location,
  onLocation,
}: SectionBodyProps): React.JSX.Element {
  const { t } = useTranslation();
  const data = usePlugins();
  const mutations = usePluginMutations();
  const addLocal = useAddLocalPluginFlow(mutations);
  const removeFlow = useRemovePluginFlow(mutations);
  const updateFlow = usePluginUpdateFlow(mutations);
  const marketplaces = useMarketplaces();
  const [selectedMarketplace, setSelectedMarketplace] = useState<string | null>(null);
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const catalog = useMarketplaceCatalog(selectedMarketplace);
  const installFlow = useInstallMarketplaceFlow(mutations);

  const [search, setSearch] = useState('');
  const selection = useSelection();
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);

  const shown = useMemo(() => visiblePlugins(data.plugins, search), [data.plugins, search]);
  const selectedPlugins = shown.filter((plugin) => selection.ids.has(plugin.id));

  const handlers: PluginActionHandlers = {
    onAddLocal: () => {
      addLocal.start();
    },
    onBrowseMarketplace: () => {
      setMarketplaceOpen(true);
    },
    onCheckUpdate: (plugin) => {
      void updateFlow.check(plugin);
    },
    onRemove: (targets) => {
      removeFlow.ask(targets);
    },
    onGoToMcpServers: () => {
      onLocation({ ...location, section: 'mcp' });
    },
  };

  const ready = !data.isLoading && data.error === null;

  return (
    <div className="flex flex-col gap-4">
      <LoadStatus
        rows={4}
        isLoading={data.isLoading}
        loadingLabel={t('engines.claude.plugins.loading')}
        error={data.error}
        onRetry={data.retry}
      />

      {ready && (
        <>
          <PluginToolbar
            engine={engine}
            plugins={data.plugins}
            selectedPlugins={selectedPlugins}
            search={search}
            onSearchChange={setSearch}
            mutations={mutations}
            handlers={handlers}
          />

          {data.plugins.length === 0 ? (
            <EmptyState
              title={t('engines.claude.plugins.emptyTitle')}
              description={t('engines.claude.plugins.emptyBody')}
            />
          ) : (
            <PluginTable
              plugins={shown}
              selected={selection.ids}
              onToggleSelected={selection.toggle}
              mutations={mutations}
              handlers={handlers}
            />
          )}
        </>
      )}

      {marketplaceOpen && (
        <MarketplaceBrowser
          marketplaces={marketplaces}
          selected={selectedMarketplace}
          onSelect={setSelectedMarketplace}
          catalog={catalog}
          search={marketplaceSearch}
          onSearchChange={setMarketplaceSearch}
          onInstall={(marketplace, entry) => {
            installFlow.ask(marketplace, entry);
          }}
        />
      )}

      <AddLocalPluginDialog flow={addLocal} />
      <InstallMarketplacePluginDialog flow={installFlow} />
      <PluginUpdateDialog flow={updateFlow} />
      <RemovePluginDialog flow={removeFlow} />
    </div>
  );
}
