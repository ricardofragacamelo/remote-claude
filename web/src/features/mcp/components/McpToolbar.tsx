import { useTranslation } from 'react-i18next';

import { useCommands } from '@/features/commands';
import { SearchField } from '@/shared/components/SearchField';
import type { SelectionBarKeys } from '@/shared/components/SelectionActionBar';
import { SelectionActionBar } from '@/shared/components/SelectionActionBar';
import { Button } from '@/shared/components/ui/button';
import type { McpServerMutations } from '../hooks/useMcpServerMutations';
import { asCommands, mcpServerActions } from '../lib/mcp-server-actions';
import type { McpServerActionHandlers } from '../lib/mcp-server-actions';
import { STATUS_KEYS } from '../lib/status-words';
import type { McpServerView, McpStatus } from '../types/mcp';

const INPUT = 'h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8';
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

        <label className="flex flex-col gap-1 text-ui-sm">
          {t('agentSettings.mcp.filterStatusLabel')}
          <select
            className={INPUT}
            value={statusFilter}
            onChange={(event) => {
              onStatusFilterChange(event.target.value as McpStatus | 'all');
            }}
          >
            <option value="all">{t('agentSettings.mcp.filterStatusAll')}</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(STATUS_KEYS[status])}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-ui-sm">
          {t('agentSettings.mcp.sortLabel')}
          <select
            className={INPUT}
            value={sort}
            onChange={(event) => {
              onSortChange(event.target.value as 'name' | 'status');
            }}
          >
            <option value="name">{t('agentSettings.mcp.sortByName')}</option>
            <option value="status">{t('agentSettings.mcp.sortByStatus')}</option>
          </select>
        </label>

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
