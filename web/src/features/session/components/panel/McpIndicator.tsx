import { Plug } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { useMcpServers } from '../../hooks/useSessionInsight';
import type { McpServer } from '../../types/insight';

/** The words of each status — named in full so the i18n check sees each key. */
const STATUS_NAMES: Readonly<Record<McpServer['status'], string>> = {
  connected: 'sessions.mcp.connected',
  failed: 'sessions.mcp.failed',
  'needs-auth': 'sessions.mcp.needsAuth',
  pending: 'sessions.mcp.pending',
  disabled: 'sessions.mcp.disabled',
};

/**
 * The MCP servers of the session, compact (plan 08, B-38): how many are fine, which are not. With
 * none it is not there; a list that cannot be read is a short line, never in the way of the chat
 * (S-178). Configuring a server is the settings of plan 11 — until that screen exists there is no
 * link to it, rather than a link to nowhere (S-179).
 */
export function McpIndicator({
  sessionId,
}: {
  readonly sessionId: string;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const loaded = useMcpServers(sessionId);
  const servers = loaded.data;

  if (loaded.error !== null) {
    return (
      <span className="text-ui-xs text-muted-foreground">{t('sessions.mcp.unavailable')}</span>
    );
  }

  if (servers === null || servers.length === 0) {
    return null;
  }

  const fine = servers.filter((server) => server.status === 'connected').length;
  const label = t('sessions.mcp.summary', { fine, count: servers.length });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={label}>
          <Plug className={cn('size-3.5', fine < servers.length && 'text-warning')} aria-hidden />
          <span className="text-ui-xs">
            {t('sessions.mcp.count', { fine, count: servers.length })}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 p-2">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <ul className="flex flex-col gap-1 text-ui-sm">
          {servers.map((server) => (
            <li key={server.name} className="flex justify-between gap-2">
              <span className="truncate">{server.name}</span>
              <span className="text-ui-xs text-muted-foreground">
                {t('sessions.mcp.line', {
                  status: t(STATUS_NAMES[server.status]),
                  tools: t('sessions.mcp.tools', { count: server.toolCount }),
                })}
              </span>
            </li>
          ))}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
