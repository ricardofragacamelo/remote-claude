import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useRuleMutations } from '@/features/permission/hooks/useRuleMutations';
import * as service from '@/features/permission/services/rule.service';

const unexpected = { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', params: {} };

/** A promise the test resolves when it chooses — how a slow answer is modelled. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('the rule mutations hook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts a grant exactly as it was given', async () => {
    const grant = vi.spyOn(service, 'grantRule').mockResolvedValue({ id: 'rule_1' } as never);
    const hook = renderHook(() => useRuleMutations());

    await act(async () => {
      await hook.result.current.grant({ pattern: 'shell(ls)', decision: 'allow', scope: 'always' });
    });

    expect(grant).toHaveBeenCalledWith({
      pattern: 'shell(ls)',
      decision: 'allow',
      scope: 'always',
    });
  });

  it('revokes a rule, and marks it in flight while it does', async () => {
    const slow = deferred<never>();
    vi.spyOn(service, 'revokeRule').mockReturnValue(slow.promise);
    const hook = renderHook(() => useRuleMutations());

    act(() => {
      void hook.result.current.revoke('rule_1');
    });
    expect(hook.result.current.inFlight.has('rule_1')).toBe(true);

    await act(async () => {
      slow.resolve({ id: 'rule_1', revokedAt: 'now' } as never);
      await slow.promise;
    });
    expect(hook.result.current.inFlight.has('rule_1')).toBe(false);
  });

  it('asks the server once for two revokes of the same rule inside one frame — S-19', async () => {
    const revoke = vi.spyOn(service, 'revokeRule').mockResolvedValue({ id: 'rule_1' } as never);
    const hook = renderHook(() => useRuleMutations());

    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    act(() => {
      first = hook.result.current.revoke('rule_1');
      second = hook.result.current.revoke('rule_1');
    });

    expect(revoke).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toEqual(await second);
  });

  it('revokes two different rules independently', async () => {
    const revoke = vi.spyOn(service, 'revokeRule').mockResolvedValue({} as never);
    const hook = renderHook(() => useRuleMutations());

    await act(async () => {
      await Promise.all([hook.result.current.revoke('a'), hook.result.current.revoke('b')]);
    });

    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('records the failure of a revoke, keyed by the rule id', async () => {
    vi.spyOn(service, 'revokeRule').mockRejectedValue(unexpected);
    const hook = renderHook(() => useRuleMutations());

    await act(async () => {
      await hook.result.current.revoke('rule_1').catch(() => undefined);
    });

    expect(hook.result.current.failure).toEqual({ ruleId: 'rule_1', error: unexpected });
    expect(hook.result.current.inFlight.has('rule_1')).toBe(false);
  });

  it('revokes a lot by its exact ids, once for two identical lots at once', async () => {
    const revokeBatch = vi.spyOn(service, 'revokeRules').mockResolvedValue({ rules: [] });
    const hook = renderHook(() => useRuleMutations());

    await act(async () => {
      await Promise.all([
        hook.result.current.revokeBatch(['a', 'b']),
        hook.result.current.revokeBatch(['a', 'b']),
      ]);
    });

    expect(revokeBatch).toHaveBeenCalledTimes(1);
    expect(revokeBatch).toHaveBeenCalledWith(['a', 'b']);
  });

  it('restores a lot by its exact ids', async () => {
    const restoreBatch = vi.spyOn(service, 'restoreRules').mockResolvedValue({ rules: [] });
    const hook = renderHook(() => useRuleMutations());

    await act(async () => {
      await hook.result.current.restoreBatch(['a', 'b']);
    });

    expect(restoreBatch).toHaveBeenCalledWith(['a', 'b']);
  });

  it('answers `changed` with the written rule, on an ordinary change — plan 15, B-12', async () => {
    const written = { id: 'rule_1', expiresAt: '2026-12-01T00:00:00.000Z' };
    vi.spyOn(service, 'changeRuleExpiry').mockResolvedValue(written as never);
    const hook = renderHook(() => useRuleMutations());

    const result = await act(async () =>
      hook.result.current.changeExpiry({
        ruleId: 'rule_1',
        etag: '"abc"',
        expiresAt: '2026-12-01T00:00:00.000Z',
      }),
    );

    expect(result).toEqual({ outcome: 'changed', rule: written });
  });

  it('answers `stale` and the fresh rule on a `412` — S-171', async () => {
    vi.spyOn(service, 'changeRuleExpiry').mockRejectedValue({ code: 'PERMISSION_RULE_CHANGED' });
    const fresh = { id: 'rule_1', expiresAt: '2026-11-01T00:00:00.000Z' };
    vi.spyOn(service, 'fetchRule').mockResolvedValue(fresh as never);
    const hook = renderHook(() => useRuleMutations());

    const result = await act(async () =>
      hook.result.current.changeExpiry({
        ruleId: 'rule_1',
        etag: '"abc"',
        expiresAt: '2026-12-01T00:00:00.000Z',
      }),
    );

    expect(result).toEqual({ outcome: 'stale', rule: fresh });
    // Never a failure: a stale etag is an answer, not a rejection.
    expect(hook.result.current.failure).toBeNull();
  });

  it('answers `conflict` and the real state on a `409` — S-172', async () => {
    vi.spyOn(service, 'changeRuleExpiry').mockRejectedValue({
      code: 'PERMISSION_RULE_STATE_CONFLICT',
    });
    const real = { id: 'rule_1', status: 'revoked' };
    vi.spyOn(service, 'fetchRule').mockResolvedValue(real as never);
    const hook = renderHook(() => useRuleMutations());

    const result = await act(async () =>
      hook.result.current.changeExpiry({
        ruleId: 'rule_1',
        etag: '"abc"',
        expiresAt: '2026-12-01T00:00:00.000Z',
      }),
    );

    expect(result).toEqual({ outcome: 'conflict', rule: real });
  });

  it('throws, and records the failure, for any other error', async () => {
    vi.spyOn(service, 'changeRuleExpiry').mockRejectedValue(unexpected);
    const hook = renderHook(() => useRuleMutations());
    let caught: unknown;

    await act(async () => {
      try {
        await hook.result.current.changeExpiry({
          ruleId: 'rule_1',
          etag: '"abc"',
          expiresAt: '2026-12-01T00:00:00.000Z',
        });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBe(unexpected);
    expect(hook.result.current.failure).toEqual({ ruleId: 'rule_1', error: unexpected });
  });
});
