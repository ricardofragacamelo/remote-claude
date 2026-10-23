import type { BatchRemoveFlow } from '@/shared/hooks/useBatchRemoveFlow';
import { useBatchRemoveFlow } from '@/shared/hooks/useBatchRemoveFlow';
import type { McpServerMutations } from './useMcpServerMutations';
import type { McpServerView } from '../types/mcp';

/** The destructive confirm of removing one or many servers (plan 13, B-28, S-135). */
export type RemoveFlow = BatchRemoveFlow<McpServerView>;

/**
 * Removing is destructive and for good — a confirm with no undo (S-135), unlike the explorer's own
 * delete (which keeps what it can in a local history): an MCP server is one row, and its secret, if
 * it has one, is already gone the moment the row is. Built on the shared `useBatchRemoveFlow`.
 */
export function useRemoveFlow(mutations: McpServerMutations): RemoveFlow {
  return useBatchRemoveFlow<McpServerView>(mutations.removeMany);
}
