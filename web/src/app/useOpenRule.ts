import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { DEFAULT_RULES_SEARCH } from '@/features/permission';
import type { RulesSearch } from '@/features/permission';

/**
 * Opens a rule by id — the audit trail's own entries lead here (D-04's second way in), and so does
 * `/rules` itself; one navigation, shared, rather than each route writing its own.
 *
 * `search` is the filters to carry over — `/rules` and `/rules/$ruleId` itself pass their own, so
 * a rule opened from a filtered list reopens that same list underneath it (S-222); the trail has
 * none of its own to lose, so it is left out there.
 */
export function useOpenRule(): (ruleId: string, search?: RulesSearch) => void {
  const navigate = useNavigate();

  return useCallback(
    (ruleId: string, search: RulesSearch = DEFAULT_RULES_SEARCH) => {
      void navigate({ to: '/rules/$ruleId', params: { ruleId }, search });
    },
    [navigate],
  );
}
