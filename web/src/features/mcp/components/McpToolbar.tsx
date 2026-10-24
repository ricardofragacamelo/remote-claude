import { useTranslation } from 'react-i18next';

import { useCommands } from '@/features/commands';
import { FilterSelect } from '@/shared/components/FilterSelect';
import { SearchField } from '@/shared/components/SearchField';
import type { SelectionBarKeys } from '@/shared/components/SelectionActionBar';
import { SelectionActionBar } from '@/shared/components/SelectionActionBar';
import { Button } from '@/shared/components/ui/button';
import type { McpServerMutations } from '../hooks/useMcpServerMutations';
import { asCommands, mcpServerActions } from '../lib/mcp-server-actions';
import type { McpServerActionHandlers } from '../lib/mcp-server-actions';
import { STATUS_KEYS } from '../lib/status-words';
import type { McpServerView, McpStatus } from '../types/mcp';

const STATUSES: readonly McpStatus[] = ['connected', 'failed', 'needs-auth', 'pending', 'disabled'];

/** The i18n keys of this toolbar's own selection bar — declared once, outside any JSX. */
const SELECTION_KEYS: SelectionBarKeys = {
  ariaLabel: 'agentSettings.mcp.selectionLabel',
  count: 'agentSettings.mcp.selectionCount',
};

/** How the table is ordered — by name, or with the status that most needs attention first. */
export type McpSortOrder = 'name' | 'status';

export interface McpToolbarProps {
  readonly engine: string;

  /** Every server of the store — what "test every one of them" (the palette command) acts on. */
  readonly servers: readonly McpServerView[];
  readonly selectedServers: readonly McpServerView[];
  readonly search: string;
  onSearchChange(search: string): void;
  readonly statusFilter: McpStatus | 'all';
  onStatusFilterChange(status: McpStatus | 'all'): void;
  readonly sort: McpSortOrder;
  onSortChange(sort: McpSortOrder): void;
  readonly mutations: McpServerMutations;
  readonly handlers: McpServerActionHandlers;
}

/**
 * Search, filter by status, "Add server", and the bulk actions of the current selection — the same
 * action list the row's own context menu and the palette use, so a label and an icon never drift
 * between the three (plan 13, B-28, S-131, S-134, S-140).
 */
export function McpToolbar({
  engine,
  servers,
  selectedServers,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sort,
  onSortChange,
  mutations,
  handlers,
}: McpToolbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const allActions = mcpServerActions(servers, mutations, handlers);
  const bulkActions = mcpServerActions(selectedServers, mutations, handlers).filter(
    (action) => action.group === 'row' && action.id !== 'mcp.editServer',
  );

  useCommands(asCommands(allActions, engine));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <SearchField
          label={t('agentSettings.mcp.searchLabel')}
          value={search}
          onChange={onSearchChange}
        />

        <FilterSelect
          label={t('agentSettings.mcp.filterStatusLabel')}
          value={statusFilter}
          onChange={(value) => {
            onStatusFilterChange(value as McpStatus | 'all');
          }}
          options={[
            { value: 'all', label: t('agentSettings.mcp.filterStatusAll') },
            ...STATUSES.map((status) => ({ value: status, label: t(STATUS_KEYS[status]) })),
          ]}
        />

        <FilterSelect
          label={t('agentSettings.mcp.sortLabel')}
          value={sort}
          onChange={(value) => {
            onSortChange(value as 'name' | 'status');
          }}
          options={[
            { value: 'name', label: t('agentSettings.mcp.sortByName') },
            { value: 'status', label: t('agentSettings.mcp.sortByStatus') },
          ]}
        />

        <Button onClick={handlers.onAdd} title={t('agentSettings.mcp.addServer')}>
          {t('agentSettings.mcp.addServer')}
        </Button>
      </div>

      <SelectionActionBar
        count={selectedServers.length}
        keys={SELECTION_KEYS}
        actions={bulkActions}
      />
    </div>
  );
}
