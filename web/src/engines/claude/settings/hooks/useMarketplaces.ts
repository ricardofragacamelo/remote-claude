import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { readStateOf, type ReadState } from '@/features/agent-settings';
import { fetchMarketplaces } from '../services/plugin.service';
import { pluginKeys } from './plugin-keys';

/** The marketplaces this installation's allowlist file currently declares (plan 13, B-47, B-29). */
export interface Marketplaces extends ReadState {
  readonly names: readonly string[];
}

/**
 * `GET /engines/claude/plugins/marketplaces` — an empty list means the feature is off: the file
 * declares none (S-212), which the screen explains rather than showing a bare "nothing here".
 */
export function useMarketplaces(): Marketplaces {
  const query = useQuery<readonly string[], AppError>({
    queryKey: pluginKeys.marketplaces(),
    queryFn: async () => (await fetchMarketplaces()).marketplaces.map((entry) => entry.name),
    retry: false,
  });

  return { names: query.data ?? [], ...readStateOf(query) };
}
