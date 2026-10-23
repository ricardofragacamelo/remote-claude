import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ContextMenuActionItems } from '@/shared/components/ContextMenuActionItems';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/shared/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import type { McpServerActionHandlers } from '../lib/mcp-server-actions';
import { mcpServerActions } from '../lib/mcp-server-actions';
import { ORIGIN_KEYS, SCOPE_KEYS, TRANSPORT_KEYS } from '../lib/status-words';
import type { McpServerMutations, TestResult } from '../hooks/useMcpServerMutations';
import type { McpServerView } from '../types/mcp';
import { StatusChip } from './StatusChip';

export interface McpServerTableProps {
  readonly servers: readonly McpServerView[];
  readonly selected: ReadonlySet<string>;
  onToggleSelected(id: string): void;
  readonly mutations: McpServerMutations;
  readonly handlers: McpServerActionHandlers;
}

function toolCountOf(result: TestResult | undefined): string {
  return result?.outcome === undefined ? '—' : String(result.outcome.tools.length);
}

/**
 * The dense table of the store's servers (plan 13, B-28, S-131): name, origin, scope, transport,
 * status (a chip, never colour alone), and the tools a test last found. Every row has the same
 * actions in its context menu that the toolbar and the palette offer (S-140).
 */
export function McpServerTable({
  servers,
  selected,
  onToggleSelected,
  mutations,
  handlers,
}: McpServerTableProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <table className="w-full text-ui-sm">
      <caption className="sr-only">{t('agentSettings.mcp.tableCaption')}</caption>
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th className="w-8 p-2">
            <span className="sr-only">{t('agentSettings.mcp.columnSelect')}</span>
          </th>
          <th className="p-2">{t('agentSettings.mcp.columnName')}</th>
          <th className="p-2">{t('agentSettings.mcp.columnOrigin')}</th>
          <th className="p-2">{t('agentSettings.mcp.columnScope')}</th>
          <th className="p-2">{t('agentSettings.mcp.columnTransport')}</th>
          <th className="p-2">{t('agentSettings.mcp.columnStatus')}</th>
          <th className="p-2">{t('agentSettings.mcp.columnTools')}</th>
        </tr>
      </thead>
      <tbody>
        {servers.map((server) => {
          const result = mutations.testResults.get(server.id);
          const actions = mcpServerActions([server], mutations, handlers);

          return (
            <ContextMenu key={server.id}>
              <ContextMenuTrigger asChild>
                <tr
                  className="cursor-default border-b border-border last:border-b-0 hover:bg-accent/50"
                  onDoubleClick={() => {
                    handlers.onEdit(server);
                  }}
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={t('agentSettings.mcp.rowSelect', { name: server.name })}
                      checked={selected.has(server.id)}
                      onChange={() => {
                        onToggleSelected(server.id);
                      }}
                    />
                  </td>
                  <td className="p-2 font-ui-strong">{server.name}</td>
                  <td className="p-2">{t(ORIGIN_KEYS.ours)}</td>
                  <td className="p-2">{t(SCOPE_KEYS[server.scope])}</td>
                  <td className="p-2">{t(TRANSPORT_KEYS[server.transport])}</td>
                  <td className="p-2">
                    <StatusChip status={server.status} />
                    {result?.error !== undefined && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            role="img"
                            aria-label={t(result.error.messageKey, result.error.params)}
                            className="ml-1 inline-flex text-destructive"
                          >
                            <TriangleAlert className="size-4" aria-hidden />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t(result.error.messageKey, result.error.params)}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </td>
                  <td className="p-2">{toolCountOf(result)}</td>
                </tr>
              </ContextMenuTrigger>
              <ContextMenuContent
                aria-label={t('agentSettings.mcp.rowMenuLabel', { name: server.name })}
              >
                <ContextMenuActionItems
                  actions={actions.map((action) => ({ ...action, disabled: !action.available() }))}
                />
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </tbody>
    </table>
  );
}
