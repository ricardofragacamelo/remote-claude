import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { readStateOf, type ReadState } from '@/features/agent-settings';
import { fetchPlugins } from '../services/plugin.service';
import type { PluginView } from '../types/plugin';
import { pluginKeys } from './plugin-keys';

/** The plugins of the caller — local and from a marketplace (plan 13, B-29). */
export interface Plugins extends ReadState {
  readonly plugins: readonly PluginView[];
}

/**
 * `GET /engines/claude/plugins` — refetched whenever a mutation of this screen settles, so the list
 * reflects a write right away, the same contract `useMcpServers` already has for MCP servers.
 */
export function usePlugins(): Plugins {
  const query = useQuery<readonly PluginView[], AppError>({
    queryKey: pluginKeys.list(),
    queryFn: fetchPlugins,
    retry: false,
  });

  return { plugins: query.data ?? [], ...readStateOf(query) };
}
