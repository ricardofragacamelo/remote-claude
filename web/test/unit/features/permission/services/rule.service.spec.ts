import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchRule, fetchRules, revokeRule } from '@/features/permission/services/rule.service';
import { api } from '@/shared/api/api';

/** A rule as the screens know it. */
const rule = {
  id: 'rule_1',
  scope: 'always',
  kind: 'shell',
  pattern: 'shell(git status)',
  decision: 'allow',
  projectPath: null,
  grantedBy: 'user-1',
  grantedAt: '2026-09-24T10:00:00.000Z',
  expiresAt: '2026-12-23T10:00:00.000Z',
  status: 'active',
  revokedAt: null,
  engine: null,
  disabled: null,
};

/** The same rule as the backend sends it: with the `toolName` it keeps for the published app. */
const wire = { ...rule, toolName: 'shell' };

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
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [wire] });

    expect(await fetchRules()).toEqual([rule]);
  });

  it('drops the native tool name: the screens name a rule by its kind — plan 28 F5', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [wire] });

    const [listed] = await fetchRules();

    expect(listed).not.toHaveProperty('toolName');
  });

  it('reads a disabled rule: its old pattern, no kind, the engine and the reason', async () => {
    const disabled = {
      ...wire,
      kind: null,
      toolName: 'Bash',
      pattern: 'Bash(npm run *)',
      status: 'disabled',
      engine: 'claude',
      disabled: { reason: 'untranslatable' },
    };
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [disabled] });

    expect(await fetchRules()).toEqual([
      {
        ...rule,
        kind: null,
        pattern: 'Bash(npm run *)',
        status: 'disabled',
        engine: 'claude',
        disabled: { reason: 'untranslatable' },
      },
    ]);
  });

  it('reads a backend from before the kind as a rule of no kind, every engine, not disabled', async () => {
    const older = { ...wire, kind: undefined, engine: undefined, disabled: undefined };
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [older] });

    expect(await fetchRules()).toEqual([{ ...rule, kind: null }]);
  });

  it('lets the failure through, already translated into an app error by the client', async () => {
    const failure = { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', traceId: 't' };
    vi.spyOn(api, 'get').mockRejectedValue(failure);

    await expect(fetchRules()).rejects.toBe(failure);
  });
});

describe('revokeRule', () => {
  it('deletes the rule, and answers it as it now stands', async () => {
    const send = vi.spyOn(api, 'request').mockResolvedValue({ ...wire, revokedAt: 'now' });

    const revoked = await revokeRule('rule_1');

    expect(send).toHaveBeenCalledWith('/permission-rules/rule_1', { method: 'DELETE' });
    expect(revoked).toEqual({ ...rule, revokedAt: 'now' });
  });

  it('escapes an id, so nothing a backend answered can build a path of its own', async () => {
    const send = vi.spyOn(api, 'request').mockResolvedValue(wire);

    await revokeRule('rule/../other');

    expect(send).toHaveBeenCalledWith('/permission-rules/rule%2F..%2Fother', { method: 'DELETE' });
  });
});

describe('fetchRule', () => {
  it('opens one rule by id, whatever its state', async () => {
    const revoked = { status: 'revoked', revokedAt: '2026-09-24T11:00:00.000Z' };
    const get = vi.spyOn(api, 'get').mockResolvedValue({ ...wire, ...revoked });

    expect(await fetchRule('rule_1')).toEqual({ ...rule, ...revoked });
    expect(get).toHaveBeenCalledWith('/permission-rules/rule_1');
  });

  it('escapes the id, so it cannot build a path of its own', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(wire);

    await fetchRule('rule/../other');

    expect(get).toHaveBeenCalledWith('/permission-rules/rule%2F..%2Fother');
  });
});
