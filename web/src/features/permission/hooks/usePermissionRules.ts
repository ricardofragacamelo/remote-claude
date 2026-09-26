import { useCallback, useRef, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { useLoad } from '@/shared/hooks/useLoad';
import { fetchRules, revokeRule } from '../services/rule.service';
import type { ListedRule, PermissionRule } from '../types/rule';

/**
 * How close to its expiry a rule is flagged. Seven days, not thirty: with the default lifetime of
 * ninety, thirty would keep a third of every rule's life under a warning, and a permanent warning
 * is one nobody reads ([D-13](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1_000;

/** A revocation that did not happen, and which row it was for. */
export interface RevokeFailure {
  readonly ruleId: string;
  readonly error: AppError;
}

/** What the screen gets: the four states, what is in flight, and the two things it can do. */
export interface PermissionRules {
  readonly isLoading: boolean;
  readonly error: AppError | null;
  readonly rules: readonly ListedRule[];

  /** The rules a revocation is running for, so each row can say so and take no second click. */
  readonly revoking: ReadonlySet<string>;

  /** The last revocation that failed. Its row stays, with the reason next to it. */
  readonly failure: RevokeFailure | null;

  revoke(ruleId: string): void;
  reload(): void;
}

/** `always` before `project`, and each project's rules together — the list reads by reach. */
const SCOPE_ORDER = { always: 0, project: 1 } as const;

/**
 * The rules, as the screen sees them.
 *
 * Three decisions here are about the person reading the list while they click:
 *
 * - **a revoked rule leaves the list**, from the answer to the revocation and not from a reload: a
 *   list that reorders under somebody's pointer is how the wrong rule gets revoked;
 * - **a failed revocation keeps the row**, with the reason beside it (S-21). Replacing the whole
 *   list with an error — what a failed load does — would hide every rule that is still answering,
 *   which is the one thing this screen exists to show;
 * - **a second click on the same row revokes nothing** (S-19). The guard is a ref and not state:
 *   two clicks inside one frame both read the state from before either of them.
 */
export function usePermissionRules(): PermissionRules {
  const { load, isLoading, error, setLoad, reload: reloadList } = useLoad(loadRules);
  const [revoking, setRevoking] = useState<ReadonlySet<string>>(() => new Set());
  const [failure, setFailure] = useState<RevokeFailure | null>(null);
  const inFlight = useRef(new Set<string>());

  const settle = useCallback((ruleId: string) => {
    inFlight.current.delete(ruleId);
    setRevoking(new Set(inFlight.current));
  }, []);

  const revoke = useCallback(
    (ruleId: string) => {
      if (inFlight.current.has(ruleId)) {
        return;
      }

      inFlight.current.add(ruleId);
      setRevoking(new Set(inFlight.current));
      setFailure(null);

      void revokeRule(ruleId)
        .then(() => {
          setLoad((current) =>
            current.status === 'ready'
              ? {
                  status: 'ready',
                  value: current.value.filter((listedRule) => listedRule.rule.id !== ruleId),
                }
              : current,
          );
        })
        .catch((cause: AppError) => {
          setFailure({ ruleId, error: cause });
        })
        .finally(() => {
          settle(ruleId);
        });
    },
    [setLoad, settle],
  );

  const reload = useCallback(() => {
    setFailure(null);
    reloadList();
  }, [reloadList]);

  return {
    isLoading,
    error,
    rules: load.status === 'ready' ? load.value : [],
    revoking,
    failure,
    revoke,
    reload,
  };
}

/**
 * The rules, read and put in order.
 *
 * The warning is computed when the answer arrives, not on every render: it is a function of the
 * clock, and a render that read the clock would be a render that cannot be repeated.
 */
async function loadRules(): Promise<readonly ListedRule[]> {
  return listed(await fetchRules(), Date.now());
}

/**
 * The rules in the order the screen shows them, each with its warning.
 *
 * Sorted by reach and then by project, keeping the server's order — newest first — inside each
 * group. `Array.prototype.sort` is stable, which is what makes "keeping" true.
 */
function listed(rules: readonly PermissionRule[], now: number): readonly ListedRule[] {
  return [...rules]
    .sort(
      (a, b) =>
        SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
        (a.projectPath ?? '').localeCompare(b.projectPath ?? ''),
    )
    .map((rule) => ({ rule, expiringSoon: isExpiringSoon(rule, now) }));
}

/**
 * Whether a rule that still answers stops doing so within the warning window.
 *
 * Written once, because the list and the screen of one rule must flag the same rules — a rule
 * warned about in one place and not the other is a warning nobody trusts.
 */
export function isExpiringSoon(rule: PermissionRule, now: number): boolean {
  return rule.status === 'active' && new Date(rule.expiresAt).getTime() - now < EXPIRY_WARNING_MS;
}
