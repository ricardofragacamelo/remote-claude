import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SectionBodyProps } from '@/features/agent-settings';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadStatus } from '@/shared/components/LoadStatus';
import { useSelection } from '@/shared/hooks/useSelection';
import { useAddServerFlow } from '../hooks/useAddServerFlow';
import { useFolderChoices } from '../hooks/useFolderChoices';
import { useMcpServerMutations } from '../hooks/useMcpServerMutations';
import { useMcpServers } from '../hooks/useMcpServers';
import { useRemoveFlow } from '../hooks/useRemoveFlow';
import type { McpServerActionHandlers } from '../lib/mcp-server-actions';
import type { McpServerView, McpStatus } from '../types/mcp';
import { AddEditServerDialog } from './AddEditServerDialog';
import { McpFolderPicker } from './McpFolderPicker';
import { McpServerTable } from './McpServerTable';
import type { McpSortOrder } from './McpToolbar';
import { McpToolbar } from './McpToolbar';
import { ProjectMcpGroup } from './ProjectMcpGroup';
import { RemoveServerDialog } from './RemoveServerDialog';

const STATUS_URGENCY: readonly McpStatus[] = [
  'failed',
  'needs-auth',
  'pending',
  'connected',
  'disabled',
];

function visibleServers(
  servers: readonly McpServerView[],
  search: string,
  statusFilter: McpStatus | 'all',
  sort: McpSortOrder,
): readonly McpServerView[] {
  const query = search.trim().toLowerCase();
  const filtered = servers.filter(
    (server) =>
      (query === '' || server.name.toLowerCase().includes(query)) &&
      (statusFilter === 'all' || server.status === statusFilter),
  );

  return [...filtered].sort((a, b) =>
    sort === 'name'
      ? a.name.localeCompare(b.name)
      : STATUS_URGENCY.indexOf(a.status) - STATUS_URGENCY.indexOf(b.status) ||
        a.name.localeCompare(b.name),
  );
}

/**
 * "Servidores MCP": the store of MCP servers of this engine, and the project's own `.mcp.json` in
 * its own group (plan 13, B-28). Shown only for an engine with the `mcp` capability — the registry
 * entry this component is wired to carries `capability: 'mcp'`, which `AgentSettingsScreen` filters
 * sections by before this is ever reached (D-82).
 */
export function McpSection({ engine, location, onLocation }: SectionBodyProps): React.JSX.Element {
  const { t } = useTranslation();
  const data = useMcpServers(engine);
  const mutations = useMcpServerMutations(engine);
  const flow = useAddServerFlow(engine, mutations);
  const removeFlow = useRemoveFlow(mutations);
  const folderChoices = useFolderChoices(location.folder);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<McpStatus | 'all'>('all');
  const [sort, setSort] = useState<McpSortOrder>('name');
  const selection = useSelection();

  const shown = useMemo(
    () => visibleServers(data.servers, search, statusFilter, sort),
    [data.servers, search, statusFilter, sort],
  );
  const selectedServers = shown.filter((server) => selection.ids.has(server.id));

  const handlers: McpServerActionHandlers = {
    onAdd: () => {
      flow.start(null);
    },
    onEdit: (server) => {
      flow.start(server);
    },
    onRemove: (targets) => {
      removeFlow.ask(targets);
    },
  };

  return (
    <div className="flex flex-col gap-4">
      <McpFolderPicker location={location} onLocation={onLocation} folderChoices={folderChoices} />

      <LoadStatus
        isLoading={data.isLoading}
        loadingLabel={t('agentSettings.mcp.loading')}
        error={data.error}
        onRetry={data.retry}
        rows={4}
      />

      {!data.isLoading && data.error === null && (
        <>
          <McpToolbar
            engine={engine}
            servers={data.servers}
            selectedServers={selectedServers}
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sort={sort}
            onSortChange={setSort}
            mutations={mutations}
            handlers={handlers}
          />

          {data.servers.length === 0 ? (
            <EmptyState
              title={t('agentSettings.mcp.emptyTitle')}
              description={t('agentSettings.mcp.emptyBody')}
            />
          ) : (
            <McpServerTable
              servers={shown}
              selected={selection.ids}
              onToggleSelected={selection.toggle}
              mutations={mutations}
              handlers={handlers}
            />
          )}
        </>
      )}

      <ProjectMcpGroup engine={engine} folder={location.folder} />

      <AddEditServerDialog flow={flow} folderChoices={folderChoices} />
      <RemoveServerDialog flow={removeFlow} />
    </div>
  );
}
