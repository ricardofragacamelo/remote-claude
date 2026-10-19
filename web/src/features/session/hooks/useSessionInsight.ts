import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { wsClient } from '@/shared/api/ws';
import type { AppError } from '@/shared/api/errors';
import { fetchContext, fetchMcpServers, mcpServerListOf } from '../services/insight.service';
import { reconnectMcpServer, toggleMcpServer } from '../services/live-session.service';
import type { ContextUse, McpServer } from '../types/insight';
import { loadedOf } from './loaded';
import type { Loaded } from './loaded';
import { useDiskMoves } from './useDiskMoves';

/** Above this share of the window, the meter warns that the conversation is near its limit. */
export const CONTEXT_WARNING_PERCENT = 80;

/**
 * The use of the session's context window (plan 08, B-37) — read again at the end of every turn, a
 * compaction included, which is when it moves.
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

/**
 * The MCP servers of the session and how each stands (B-38; plan 13, B-22) — read once over HTTP,
 * and kept live after: `session.mcpStatusChanged` always carries the whole list, so a fresh one
 * replaces the cache outright, never a second read.
 */
export function useMcpServers(sessionId: string): Loaded<readonly McpServer[]> {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      // `onSessionFrame`, not `observe`: this session is watched right here, which is exactly the
      // case `observe` excludes (it exists for sessions nobody here is attached to).
      wsClient.onSessionFrame((frame) => {
        if (frame.type === 'session.mcpStatusChanged' && frame.sessionId === sessionId) {
          queryClient.setQueryData(
            ['sessions', 'mcp', sessionId],
            mcpServerListOf(frame.payload?.['servers']),
          );
        }
      }),
    [sessionId, queryClient],
  );

  return loadedOf(
    useQuery<readonly McpServer[], AppError>({
      queryKey: ['sessions', 'mcp', sessionId],
      queryFn: () => fetchMcpServers(sessionId),
      staleTime: 60_000,
      retry: false,
    }),
  );
}

/**
 * Switches one MCP server of the session on or off (plan 13, B-22) — nothing when there is no
 * session. The result is never assumed here: it arrives as `session.mcpStatusChanged`, which
 * {@link useMcpServers} already listens for.
 */
export function useToggleMcpServer(
  sessionId: string | null,
): (name: string, enabled: boolean) => void {
  return useCallback(
    (name: string, enabled: boolean) => {
      if (sessionId !== null) {
        toggleMcpServer(wsClient, sessionId, name, enabled);
      }
    },
    [sessionId],
  );
}

/** Reconnects one MCP server of the session — the way back from `failed` (plan 13, B-22). */
export function useReconnectMcpServer(sessionId: string | null): (name: string) => void {
  return useCallback(
    (name: string) => {
      if (sessionId !== null) {
        reconnectMcpServer(wsClient, sessionId, name);
      }
    },
    [sessionId],
  );
}
