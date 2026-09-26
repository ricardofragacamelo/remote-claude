import { useCallback, useRef, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { useLoad } from '@/shared/hooks/useLoad';
import { fetchRule, revokeRule } from '../services/rule.service';
import type { PermissionRule } from '../types/rule';
import { isExpiringSoon } from './usePermissionRules';

/** The rule as it was loaded, with its warning computed at that moment. */
interface Opened {
  readonly rule: PermissionRule;
  readonly expiringSoon: boolean;
}

/** What the screen of one rule gets: the four states, and taking it back. */
export interface OpenedRule {
  readonly isLoading: boolean;
  readonly error: AppError | null;
  readonly rule: PermissionRule | null;
  readonly expiringSoon: boolean;
  readonly isRevoking: boolean;

  /** Why the last revocation did not happen. The rule stays on screen, as it still answers. */
  readonly failure: AppError | null;

  revoke(): void;
  reload(): void;
}

/**
 * One rule, opened by id — from the trail entry it answered, most of the time.
 *
 * Revoking here is revoking in the list: the same one click, the same guard against a second one,
 * and the same failure that keeps the rule on screen. What differs is the answer: the rule stays,
 * now marked revoked, because the person came here to see what let something run — and "it no
 * longer does" is the answer to show, not an empty page.
 */
export function usePermissionRule(ruleId: string): OpenedRule {
  // The warning is computed when the answer arrives, not on every render: it is a function of the
  // clock, and a render that read the clock would be a render that cannot be repeated.
  const fetch = useCallback(async (): Promise<Opened> => {
    const rule = await fetchRule(ruleId);
    return { rule, expiringSoon: isExpiringSoon(rule, Date.now()) };
  }, [ruleId]);
  const { load, isLoading, error, setLoad, reload } = useLoad(fetch);
  const [isRevoking, setRevoking] = useState(false);
  const [failure, setFailure] = useState<AppError | null>(null);
  const inFlight = useRef(false);

  const revoke = useCallback(() => {
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setRevoking(true);
    setFailure(null);

    void revokeRule(ruleId)
      .then((revoked) => {
        setLoad(() => ({ status: 'ready', value: { rule: revoked, expiringSoon: false } }));
      })
      .catch((cause: AppError) => {
        setFailure(cause);
      })
      .finally(() => {
        inFlight.current = false;
        setRevoking(false);
      });
  }, [ruleId, setLoad]);

  const opened = load.status === 'ready' ? load.value : null;

  return {
    isLoading,
    error,
    rule: opened?.rule ?? null,
    expiringSoon: opened?.expiringSoon ?? false,
    isRevoking,
    failure,
    revoke,
    reload,
  };
}
