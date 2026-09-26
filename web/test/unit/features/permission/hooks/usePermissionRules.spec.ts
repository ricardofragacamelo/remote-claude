import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import {
  EXPIRY_WARNING_MS,
  usePermissionRules,
} from '@/features/permission/hooks/usePermissionRules';
import { api } from '@/shared/api/api';

const NOW = new Date('2026-09-24T12:00:00.000Z');

function aRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'rule_1',
    scope: 'always',
    toolName: 'Bash',
    pattern: 'Bash(git status)',
    decision: 'allow',
    projectPath: null,
    grantedBy: 'user-1',
    grantedAt: '2026-09-24T10:00:00.000Z',
    expiresAt: '2026-12-23T10:00:00.000Z',
    status: 'active',
    revokedAt: null,
    ...overrides,
  };
}

const unexpected = {
  code: 'INTERNAL_ERROR',
  messageKey: 'common.error.unexpected',
  params: {},
  traceId: 'trace-1',
};

/**
 * What the rules screen cannot be made to hold still for: two clicks inside one frame, an answer
 * that arrives after its list was thrown away, and the clock the warning is computed against.
 * What a person sees is `RuleList.spec.tsx`.
 */
describe('the rules hook', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function loaded(...rules: readonly unknown[]) {
    vi.spyOn(api, 'get').mockResolvedValue({ rules });
    const hook = renderHook(() => usePermissionRules());
    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });
    return hook;
  }

  it('revokes once for two clicks inside the same frame — S-19', async () => {
    const { result } = await loaded(aRule());
    const send = vi.spyOn(api, 'request').mockReturnValue(new Promise(() => undefined));

    // Both calls read the state from before either of them: only a ref can tell them apart.
    act(() => {
      result.current.revoke('rule_1');
      result.current.revoke('rule_1');
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.revoking.has('rule_1')).toBe(true);
  });

  it('lets a rule be revoked again after a failure — the guard is for what is in flight', async () => {
    const { result } = await loaded(aRule());
    const send = vi.spyOn(api, 'request').mockRejectedValueOnce(unexpected).mockResolvedValue({});

    act(() => {
      result.current.revoke('rule_1');
    });
    await waitFor(() => {
      expect(result.current.failure).not.toBeNull();
    });

    act(() => {
      result.current.revoke('rule_1');
    });
    await waitFor(() => {
      expect(result.current.rules).toEqual([]);
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.failure).toBeNull();
  });

  it('keeps the row of a failed revocation, with the failure beside it — S-21', async () => {
    const { result } = await loaded(aRule());
    vi.spyOn(api, 'request').mockRejectedValue(unexpected);

    act(() => {
      result.current.revoke('rule_1');
    });
    await waitFor(() => {
      expect(result.current.failure).toEqual({ ruleId: 'rule_1', error: unexpected });
    });

    expect(result.current.rules).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(result.current.revoking.size).toBe(0);
  });

  it('forgets the failure when the list is loaded again', async () => {
    const { result } = await loaded(aRule());
    vi.spyOn(api, 'request').mockRejectedValue(unexpected);

    act(() => {
      result.current.revoke('rule_1');
    });
    await waitFor(() => {
      expect(result.current.failure).not.toBeNull();
    });

    act(() => {
      result.current.reload();
    });

    expect(result.current.failure).toBeNull();
  });

  it('writes nothing back when the list was thrown away before the answer came', async () => {
    const { result } = await loaded(aRule());
    let answer: (value: unknown) => void = () => undefined;
    vi.spyOn(api, 'request').mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));

    act(() => {
      result.current.revoke('rule_1');
      result.current.reload();
    });
    await act(async () => {
      answer({});
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.rules).toEqual([]);
  });

  it.each([
    ['a day left', 24 * 60 * 60 * 1_000, true],
    ['just under the threshold', EXPIRY_WARNING_MS - 1, true],
    ['exactly the threshold', EXPIRY_WARNING_MS, false],
    ['ninety days left', 90 * 24 * 60 * 60 * 1_000, false],
  ])('flags a rule with %s — S-66', async (_case, left, flagged) => {
    const { result } = await loaded(
      aRule({ expiresAt: new Date(NOW.getTime() + left).toISOString() }),
    );

    expect(result.current.rules[0]?.expiringSoon).toBe(flagged);
  });

  it('does not flag an expired rule as about to expire — it already did', async () => {
    const { result } = await loaded(
      aRule({ status: 'expired', expiresAt: '2026-09-20T12:00:00.000Z' }),
    );

    expect(result.current.rules[0]?.expiringSoon).toBe(false);
  });

  it('reads by reach: every `always` first, then each project’s rules together', async () => {
    const { result } = await loaded(
      aRule({ id: 'p-b', scope: 'project', projectPath: '/srv/b' }),
      aRule({ id: 'a-1' }),
      aRule({ id: 'p-a', scope: 'project', projectPath: '/srv/a' }),
      aRule({ id: 'p-b2', scope: 'project', projectPath: '/srv/b' }),
      aRule({ id: 'a-2' }),
    );

    // Inside each group the server's order — newest first — survives.
    expect(result.current.rules.map((listed) => listed.rule.id)).toEqual([
      'a-1',
      'a-2',
      'p-a',
      'p-b',
      'p-b2',
    ]);
  });
});
