import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchRule, fetchRules, revokeRule } from '@/features/permission/services/rule.service';
import { api } from '@/shared/api/api';

const rule = {
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
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchRules', () => {
  it('asks the one endpoint there is', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });

    await fetchRules();

    expect(get).toHaveBeenCalledWith('/permission-rules');
  });

  it('unwraps the envelope, so nothing above it knows the response has one', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [rule] });

    expect(await fetchRules()).toEqual([rule]);
  });

  it('lets the failure through, already translated into an app error by the client', async () => {
    const failure = { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', traceId: 't' };
    vi.spyOn(api, 'get').mockRejectedValue(failure);

    await expect(fetchRules()).rejects.toBe(failure);
  });
});

describe('revokeRule', () => {
  it('deletes the rule, and answers it as it now stands', async () => {
    const send = vi.spyOn(api, 'request').mockResolvedValue({ ...rule, revokedAt: 'now' });

    const revoked = await revokeRule('rule_1');

    expect(send).toHaveBeenCalledWith('/permission-rules/rule_1', { method: 'DELETE' });
    expect(revoked).toEqual({ ...rule, revokedAt: 'now' });
  });

  it('escapes an id, so nothing a backend answered can build a path of its own', async () => {
    const send = vi.spyOn(api, 'request').mockResolvedValue(rule);

    await revokeRule('rule/../other');

    expect(send).toHaveBeenCalledWith('/permission-rules/rule%2F..%2Fother', { method: 'DELETE' });
  });
});

describe('fetchRule', () => {
  it('opens one rule by id, whatever its state', async () => {
    const revoked = { ...rule, status: 'revoked', revokedAt: '2026-09-24T11:00:00.000Z' };
    const get = vi.spyOn(api, 'get').mockResolvedValue(revoked);

    expect(await fetchRule('rule_1')).toEqual(revoked);
    expect(get).toHaveBeenCalledWith('/permission-rules/rule_1');
  });

  it('escapes the id, so it cannot build a path of its own', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(rule);

    await fetchRule('rule/../other');

    expect(get).toHaveBeenCalledWith('/permission-rules/rule%2F..%2Fother');
  });
});
