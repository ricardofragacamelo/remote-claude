import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { usePermissionRule } from '@/features/permission/hooks/usePermissionRule';
import * as service from '@/features/permission/services/rule.service';
import type { PermissionRule } from '@/features/permission';

const NOW = new Date('2026-09-24T12:00:00.000Z');

function aRule(overrides: Partial<PermissionRule> = {}): PermissionRule {
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

describe('the hook of one rule', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function opened(rule: PermissionRule = aRule()) {
    vi.spyOn(service, 'fetchRule').mockResolvedValue(rule);
    const hook = renderHook(() => usePermissionRule(rule.id));
    await waitFor(() => {
      expect(hook.result.current.isLoading).toBe(false);
    });
    return hook;
  }

  it('opens the rule it was given the id of', async () => {
    const hook = await opened();

    expect(service.fetchRule).toHaveBeenCalledWith('rule_1');
    expect(hook.result.current.rule).toEqual(aRule());
    expect(hook.result.current.expiringSoon).toBe(false);
  });

  it('flags a rule that expires within the week', async () => {
    const hook = await opened(aRule({ expiresAt: '2026-09-26T12:00:00.000Z' }));

    expect(hook.result.current.expiringSoon).toBe(true);
  });

  it('keeps the rule, now revoked, once revoked — it came here to see it — S-50', async () => {
    const revoked = aRule({ status: 'revoked', revokedAt: NOW.toISOString() });
    vi.spyOn(service, 'revokeRule').mockResolvedValue(revoked);
    const hook = await opened();

    act(() => {
      hook.result.current.revoke();
    });
    await waitFor(() => {
      expect(hook.result.current.rule?.status).toBe('revoked');
    });
    expect(hook.result.current.isRevoking).toBe(false);
  });

  it('revokes once for two clicks inside the same frame', async () => {
    const revoke = vi
      .spyOn(service, 'revokeRule')
      .mockResolvedValue(aRule({ status: 'revoked', revokedAt: NOW.toISOString() }));
    const hook = await opened();

    act(() => {
      hook.result.current.revoke();
      hook.result.current.revoke();
    });
    await waitFor(() => {
      expect(hook.result.current.isRevoking).toBe(false);
    });

    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('keeps the rule on screen when revoking fails, with the reason', async () => {
    vi.spyOn(service, 'revokeRule').mockRejectedValue(unexpected);
    const hook = await opened();

    act(() => {
      hook.result.current.revoke();
    });
    await waitFor(() => {
      expect(hook.result.current.failure).toBe(unexpected);
    });

    expect(hook.result.current.rule?.status).toBe('active');
  });

  it('holds the failure of opening, instead of a rule', async () => {
    vi.spyOn(service, 'fetchRule').mockRejectedValue(unexpected);
    const hook = renderHook(() => usePermissionRule('rule_1'));

    await waitFor(() => {
      expect(hook.result.current.error).toBe(unexpected);
    });
    expect(hook.result.current.rule).toBeNull();
  });
});
