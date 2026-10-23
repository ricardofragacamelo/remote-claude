import type { BatchRemoveFlow } from '@/shared/hooks/useBatchRemoveFlow';
import { useBatchRemoveFlow } from '@/shared/hooks/useBatchRemoveFlow';
import type { PluginMutations } from './usePluginMutations';
import type { PluginView } from '../types/plugin';

/** The destructive confirm of removing one or many plugins (plan 13, B-29). */
export type RemovePluginFlow = BatchRemoveFlow<PluginView>;

/**
 * Removing is destructive and for good — a confirm with no undo, the same discipline
 * `useRemoveFlow` already has for an MCP server (S-135), both built on the shared
 * `useBatchRemoveFlow`.
 */
export function useRemovePluginFlow(mutations: PluginMutations): RemovePluginFlow {
  return useBatchRemoveFlow<PluginView>(mutations.removeMany);
}
