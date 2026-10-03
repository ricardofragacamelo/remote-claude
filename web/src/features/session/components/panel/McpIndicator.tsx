import { Plug } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { MenuTrigger } from '@/shared/components/MenuTrigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
} from '@/shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
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

/** The look of an icon of the header — the touch target under `md`, dense above it. */
const HEADER_ICON =
  'inline-flex size-touch shrink-0 items-center justify-center rounded-md hover:bg-accent md:size-7';

/**
 * The MCP servers of the session (plan 08, B-38), as an icon of the header (plan 09, B-18): neutral
 * with every server connected, in the tone of a warning when one is not, and the list a click away.
 * With none it is not there; a list that cannot be read is an icon that says so, and never breaks the
 * strip (S-44, S-178). Configuring a server is the settings of plan 13 — until that screen exists
 * there is no link to it, rather than a link to nowhere (S-179).
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
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            className={cn(HEADER_ICON, 'text-muted-foreground hover:bg-transparent')}
            aria-label={t('sessions.mcp.unavailable')}
          >
            <Plug className="size-4 opacity-50" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('sessions.mcp.unavailable')}</TooltipContent>
      </Tooltip>
    );
  }

  if (servers === null || servers.length === 0) {
    return null;
  }

  const fine = servers.filter((server) => server.status === 'connected').length;
  const label = t('sessions.mcp.summary', { fine, count: servers.length });

  return (
    <DropdownMenu>
      <MenuTrigger label={label}>
        <button
          type="button"
          aria-label={label}
          className={cn(HEADER_ICON, fine < servers.length && 'text-warning')}
        >
          <Plug className="size-4" aria-hidden />
        </button>
      </MenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
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
