import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { fetchContext, fetchMcpServers } from '../services/insight.service';
import type { ContextUse, McpServer } from '../types/insight';
import { loadedOf } from './loaded';
import type { Loaded } from './loaded';
import { useDiskMoves } from './useDiskMoves';

/** Above this share of the window, the meter warns that the conversation is near its limit. */
export const CONTEXT_WARNING_PERCENT = 80;

/**
 * The use of the session's context window (plan 08, B-37) — read again at the end of every turn, a
 * `/compact` included, which is when it moves.
 */
export function useContextUse(sessionId: string): Loaded<ContextUse> {
  const queryClient = useQueryClient();
  const key = ['sessions', 'context', sessionId];

  useDiskMoves(sessionId, () => {
    void queryClient.invalidateQueries({ queryKey: key });
  });

  return loadedOf(
    useQuery<ContextUse, AppError>({
      queryKey: key,
      queryFn: () => fetchContext(sessionId),
      staleTime: 0,
      retry: false,
    }),
  );
}

/** The MCP servers of the session and how each stands (B-38) — read once, and again on demand. */
export function useMcpServers(sessionId: string): Loaded<readonly McpServer[]> {
  return loadedOf(
    useQuery<readonly McpServer[], AppError>({
      queryKey: ['sessions', 'mcp', sessionId],
      queryFn: () => fetchMcpServers(sessionId),
      staleTime: 60_000,
      retry: false,
    }),
  );
}
