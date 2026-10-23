import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { readStateOf, type ReadState } from '@/features/agent-settings';
import { fetchMarketplaceCatalog } from '../services/plugin.service';
import type { MarketplaceCatalogEntry } from '../types/plugin';
import { pluginKeys } from './plugin-keys';

/** What one declared marketplace lists, read live (plan 13, B-47, B-29, S-212). */
export interface MarketplaceCatalog extends ReadState {
  readonly plugins: readonly MarketplaceCatalogEntry[];
}

/**
 * `GET /engines/claude/plugins/marketplaces/:name` — read only while a marketplace is chosen
 * (`name` is `null` on the browser's own landing state, the same "nothing fetched until asked"
 * discipline `ProjectMcpGroup` already has for a folder that is not chosen yet).
 */
export function useMarketplaceCatalog(name: string | null): MarketplaceCatalog {
  const query = useQuery<readonly MarketplaceCatalogEntry[], AppError>({
    queryKey: pluginKeys.marketplaceCatalog(name ?? ''),
    queryFn: async () => (await fetchMarketplaceCatalog(name as string)).plugins,
    enabled: name !== null,
    retry: false,
  });
  const state = readStateOf(query);

  return {
    plugins: name === null ? [] : (query.data ?? []),
    ...state,
    isLoading: name !== null && state.isLoading,
  };
}
