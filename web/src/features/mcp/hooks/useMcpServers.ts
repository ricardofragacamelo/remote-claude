import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { fetchMcpServers } from '../services/mcp.service';
import type { McpServerView } from '../types/mcp';
import { mcpKeys } from './mcp-keys';

/** The MCP servers of the store, for one engine (plan 13, B-28). */
export interface McpServers {
  readonly servers: readonly McpServerView[];
  readonly isLoading: boolean;
  readonly error: AppError | null;
  retry(): void;
}

/**
 * `GET /engines/:engine/mcp-servers` — refetched whenever a mutation of this feature settles, so the
 * list reflects a write right away without this hook polling on its own.
 *
 * Does not reuse `agent-settings`' own `readStateOf` for this tail, even though it is the same
 * shape: `agent-settings-sections.ts` imports `McpSection` (and so this file, transitively) to
 * register the MCP section — a value import back from here would close that exact cycle (D-83's
 * same reasoning for why `mcp` keeps its own `useFolderChoices` instead of the real one).
 */
export function useMcpServers(engine: string): McpServers {
  const query = useQuery<readonly McpServerView[], AppError>({
    queryKey: mcpKeys.servers(engine),
    queryFn: () => fetchMcpServers(engine),
    retry: false,
  });

  return {
    servers: query.data ?? [],
    isLoading: query.isPending,
    error: query.error,
    retry: () => {
      void query.refetch();
    },
  };
}
