import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { readStateOf, type ReadState } from '@/features/agent-settings';
import { fetchRateLimits } from '../services/claude-engine.service';
import type { RateLimitWindow } from '../types/rate-limits';
import { claudeEngineKeys } from './claude-engine-keys';

/** How often the screen reads the windows again while it is open — never real-time (D-09), just kept fresh. */
export const RATE_LIMITS_POLL_MS = 60_000;

/** The rate-limit windows of the account, and the four states of reading them. */
export interface RateLimits extends ReadState {
  readonly windows: readonly RateLimitWindow[];
}

export function useRateLimits(): RateLimits {
  const query = useQuery<{ windows: readonly RateLimitWindow[] }, AppError>({
    queryKey: claudeEngineKeys.rateLimits(),
    queryFn: () => fetchRateLimits(),
    retry: false,
    refetchInterval: RATE_LIMITS_POLL_MS,
  });

  return {
    windows: query.data?.windows ?? [],
    ...readStateOf(query),
  };
}
