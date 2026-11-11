import { useCallback, useRef, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import {
  changeRuleExpiry,
  fetchRule,
  grantRule,
  restoreRules,
  revokeRule,
  revokeRules,
} from '../services/rule.service';
import type {
  ChangeRuleExpiryInput,
  GrantRuleInput,
  PermissionRule,
  RuleBatch,
} from '../types/rule';

/** The two codes `PATCH /permission-rules/:ruleId` answers when the write loses a race (plan 15, B-12). */
const STALE_ETAG = 'PERMISSION_RULE_CHANGED';
const STATE_CONFLICT = 'PERMISSION_RULE_STATE_CONFLICT';

/**
 * What changing a rule's validity answered — never thrown, so a screen branches on `outcome`
 * rather than a `catch` for the two races a `PATCH` can lose (S-171, S-172).
 */
export type ChangeRuleExpiryResult =
  | { readonly outcome: 'changed'; readonly rule: PermissionRule }
  /** `412` — the rule moved since the screen read its `etag`. Reloaded; nothing was written. */
  | { readonly outcome: 'stale'; readonly rule: PermissionRule }
  /** `409` — the rule is no longer `active` (revoked, or raced to it). Reloaded, in its real state. */
  | { readonly outcome: 'conflict'; readonly rule: PermissionRule };

/** A mutation that failed, and which rule it was for. */
export interface RuleMutationFailure {
  readonly ruleId: string;
  readonly error: AppError;
}

/** What every screen that changes a rule needs — one guard against a second click, shared by all of them. */
export interface RuleMutations {
  /** The rules a mutation is running for — so a row can say so, and take no second click (S-19). */
  readonly inFlight: ReadonlySet<string>;

  /** The last mutation that failed. The row it was for stays, with the reason beside it. */
  readonly failure: RuleMutationFailure | null;

  grant(input: GrantRuleInput): Promise<PermissionRule>;
  revoke(ruleId: string): Promise<PermissionRule>;
  revokeBatch(ruleIds: readonly string[]): Promise<RuleBatch>;
  restoreBatch(ruleIds: readonly string[]): Promise<RuleBatch>;
  changeExpiry(input: ChangeRuleExpiryInput): Promise<ChangeRuleExpiryResult>;
}

/**
 * Every write the rules screen makes, behind the one guard every one of them needs: a second
 * click on the same rule (or the same batch, by its exact ids) asks nothing of the network and
 * gets the **same** promise the first click is already waiting on — never a promise of its own
 * that quietly resolves to nothing (plan 15, B-20). The guard is a ref rather than state: two
 * clicks inside one frame both read it from before either settles.
 *
 * `changeExpiry` never throws its two races: `412` and `409` are answers, not failures — the rule
 * is read again, fresh, and the screen decides what to show from `outcome` (S-171, S-172). Every
 * other mutation throws its `AppError` as it is, caught here only to record `failure` for the row.
 */
export function useRuleMutations(): RuleMutations {
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(() => new Set());
  const [failure, setFailure] = useState<RuleMutationFailure | null>(null);
  const running = useRef(new Map<string, Promise<unknown>>());

  /** Runs `action` under `key`'s guard — a second call under the same key gets this one's promise. */
  const guarded = useCallback(<T>(key: string, action: () => Promise<T>): Promise<T> => {
    const already = running.current.get(key);

    if (already !== undefined) {
      return already as Promise<T>;
    }

    setFailure(null);

    const promise = action()
      .catch((error: AppError) => {
        setFailure({ ruleId: key, error });
        throw error;
      })
      .finally(() => {
        running.current.delete(key);
        setInFlight(new Set(running.current.keys()));
      });

    running.current.set(key, promise);
    setInFlight(new Set(running.current.keys()));

    return promise;
  }, []);

  const grant = useCallback(
    (input: GrantRuleInput): Promise<PermissionRule> => grantRule(input),
    [],
  );

  const revoke = useCallback(
    (ruleId: string): Promise<PermissionRule> => guarded(ruleId, () => revokeRule(ruleId)),
    [guarded],
  );

  const revokeBatch = useCallback(
    (ruleIds: readonly string[]): Promise<RuleBatch> =>
      guarded(batchKey('revoke', ruleIds), () => revokeRules(ruleIds)),
    [guarded],
  );

  const restoreBatch = useCallback(
    (ruleIds: readonly string[]): Promise<RuleBatch> =>
      guarded(batchKey('restore', ruleIds), () => restoreRules(ruleIds)),
    [guarded],
  );

  const changeExpiry = useCallback(
    (input: ChangeRuleExpiryInput): Promise<ChangeRuleExpiryResult> =>
      guarded(input.ruleId, async () => {
        try {
          return { outcome: 'changed', rule: await changeRuleExpiry(input) };
        } catch (error) {
          const code = (error as AppError).code;

          if (code === STALE_ETAG) {
            return { outcome: 'stale', rule: await fetchRule(input.ruleId) };
          }

          if (code === STATE_CONFLICT) {
            return { outcome: 'conflict', rule: await fetchRule(input.ruleId) };
          }

          throw error;
        }
      }),
    [guarded],
  );

  return { inFlight, failure, grant, revoke, revokeBatch, restoreBatch, changeExpiry };
}

/**
 * One key per lot, by its exact ids — two different lots never collapse into the same guard.
 * Exported so a screen can check `inFlight`/`failure` for the exact lot it is about to send, before
 * `revokeBatch`/`restoreBatch` ever runs (B-24) — never a second, drifting copy of this format.
 */
export function batchKey(action: 'revoke' | 'restore', ruleIds: readonly string[]): string {
  return `${action}:${[...ruleIds].sort().join(',')}`;
}
