import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionReasonRequiredError, PermissionScopeUnsupportedError } from '@domain/permission';
import type { RuleReachKind } from '@domain/permission';
import {
  PERMISSION_OWNER,
  PERMISSION_PROJECT,
  PERMISSION_SESSION,
  aPermissionModule,
  aPermissionQuestion,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

/**
 * Answering with a reach — plan 23, B-10.
 *
 * The client names a reach and never a pattern; the patterns are computed again from the request.
 * What is proved: each scope leaves the rules of the chosen reach, a reach that was not offered is
 * refused with the question still open, and a grant of several patterns is all or none.
 */
describe('ResolvePermissionUseCase — the reach', () => {
  let harness: PermissionHarness;

  beforeEach(() => {
    harness = aPermissionModule();
  });

  const ask = (requestId: string, input: Record<string, unknown>, toolName = 'Bash') =>
    harness.request.execute(aPermissionQuestion({ requestId, toolName, input }));

  const answer = (
    overrides: {
      scope?: string;
      reach?: RuleReachKind | null;
      decision?: 'allow' | 'deny';
      reason?: string | null;
      requestId?: string;
    } = {},
  ) =>
    harness.resolve.execute({
      requestId: overrides.requestId ?? 'request-1',
      decision: overrides.decision ?? 'allow',
      reason: overrides.reason ?? null,
      scope: overrides.scope ?? 'session',
      reach: overrides.reach ?? null,
      userId: PERMISSION_OWNER,
      resolvedFrom: 'web',
      watchesSession: () => true,
    });

  it('leaves a session rule per pattern, and the next line of the same commands is not asked — S-56', async () => {
    await ask('request-1', { command: 'git push 2>&1 | tail -5' });
    await answer({ reach: 'prefix' });

    const next = await ask('request-2', { command: 'git push origin main | tail -20' });

    expect(next).toEqual({
      kind: 'settled',
      resolution: expect.objectContaining({ decision: 'allow', via: 'rule' }),
    });
  });

  it('grants every pattern of the prefix for `always`, each one on the trail — S-57', async () => {
    await ask('request-1', { command: 'git push 2>&1 | tail -5' });
    await answer({ scope: 'always', reach: 'prefix' });

    expect(harness.rules.rules.map((rule) => rule.ruleContent)).toEqual([
      'Bash(git push:*)',
      'Bash(tail:*)',
    ]);
    expect(harness.trail.kinds).toEqual(['permission.ruleGranted', 'permission.ruleGranted']);
  });

  it('remembers a tool known only by name for the session — S-58', async () => {
    await ask('request-1', { query: 'vitest' }, 'WebSearch');
    await answer({ reach: 'tool' });

    const next = await ask('request-2', { query: 'zod' }, 'WebSearch');

    expect(next.kind).toBe('settled');
  });

  it.each([
    ['tool', 'session'],
    ['tool', 'always'],
  ] as const)(
    'refuses the %s reach a shell line does not have, for %s — S-59',
    async (reach, scope) => {
      await ask('request-1', { command: 'git status' });

      await expect(answer({ scope, reach })).rejects.toThrow(PermissionScopeUnsupportedError);
      expect(harness.registry.find('request-1')?.isPending).toBe(true);
      expect(harness.rules.rules).toEqual([]);
    },
  );

  it('reads no reach as `exact` — S-61', async () => {
    await ask('request-1', { command: 'git status' });
    await answer({ scope: 'project' });

    expect(harness.rules.rules.map((rule) => rule.ruleContent)).toEqual(['Bash(git status)']);
    expect(harness.rules.rules[0]?.projectPath).toBe(PERMISSION_PROJECT);
  });

  it('refuses `project` with no reach when there is no exact pattern — S-61', async () => {
    await ask('request-1', { query: 'vitest' }, 'WebSearch');

    await expect(answer({ scope: 'project' })).rejects.toThrow(PermissionScopeUnsupportedError);
    expect(harness.registry.find('request-1')?.isPending).toBe(true);
  });

  it('keeps `session` with no reach and no exact pattern a one-off, as before', async () => {
    await ask('request-1', { query: 'vitest' }, 'WebSearch');
    await answer();

    expect(harness.registry.rulesOf(PERMISSION_SESSION)).toEqual([]);
  });

  it('ignores the reach of a one-off', async () => {
    await ask('request-1', { command: 'git status' });

    const settling = await answer({ scope: 'once', reach: 'tool' });

    expect(settling.won).toBe(true);
  });

  it('takes back what this answer granted when the trail fails on the second pattern — S-62, D-13', async () => {
    await ask('request-1', { command: 'git push | tail -5' });
    harness.trail.failAt = { attempt: 1, error: new Error('trail down') };

    await expect(answer({ scope: 'always', reach: 'prefix' })).rejects.toThrow('trail down');

    expect(harness.rules.rules.every((rule) => rule.revokedAt !== null)).toBe(true);
    expect(harness.trail.kinds).toEqual(['permission.ruleGranted', 'permission.ruleRevoked']);
    expect(harness.registry.find('request-1')?.isPending).toBe(true);
  });

  it('leaves alone a rule that existed before the answer, when taking back — D-13', async () => {
    const before = await harness.grant.execute({
      userId: PERMISSION_OWNER,
      pattern: 'Bash(git push:*)',
      decision: 'allow',
      scope: 'always',
      projectPath: null,
      expiresAt: null,
    });
    await ask('request-1', { command: 'git push && rm -rf x' });
    harness.trail.failAt = { attempt: 1, error: new Error('trail down') };

    await expect(answer({ scope: 'always', reach: 'prefix' })).rejects.toThrow('trail down');

    expect(harness.rules.rules.find((rule) => rule.id === before.id)?.revokedAt).toBeNull();
  });

  it('refuses a batch with an invalid pattern before storing any — S-63', async () => {
    await expect(
      harness.grant.executeAll([
        {
          userId: PERMISSION_OWNER,
          pattern: 'Bash(git push:*)',
          decision: 'allow',
          scope: 'always',
          projectPath: null,
          expiresAt: null,
        },
        {
          userId: PERMISSION_OWNER,
          pattern: 'Bash()',
          decision: 'allow',
          scope: 'always',
          projectPath: null,
          expiresAt: null,
        },
      ]),
    ).rejects.toThrow();

    expect(harness.rules.rules).toEqual([]);
    expect(harness.trail.kinds).toEqual([]);
  });

  it('lets the first of two answers in flight together win, and grants only its rule — S-65', async () => {
    await ask('request-1', { file_path: '/workspace/a.md', content: 'x' }, 'Write');

    const [first, second] = await Promise.all([
      answer({ scope: 'always', reach: 'tool' }),
      answer({ scope: 'always', reach: 'exact' }),
    ]);

    expect(first.won).toBe(true);
    expect(second).toMatchObject({ won: false, resolution: { decision: 'allow' } });
    expect(harness.rules.rules.map((rule) => rule.ruleContent)).toEqual(['Write']);
  });

  it('lets the second answer settle when the first one in flight was refused — S-65', async () => {
    await ask('request-1', { command: 'git status' });

    const [first, second] = await Promise.allSettled([
      answer({ scope: 'always', reach: 'tool' }),
      answer({ scope: 'always', reach: 'exact' }),
    ]);

    expect(first.status).toBe('rejected');
    expect(second).toMatchObject({ status: 'fulfilled', value: { won: true } });
    expect(harness.rules.rules.map((rule) => rule.ruleContent)).toEqual(['Bash(git status)']);
  });

  it('grants nothing twice when the same answer comes again — S-64', async () => {
    await ask('request-1', { command: 'git push | tail -5' });
    await answer({ scope: 'always', reach: 'prefix' });
    await ask('request-2', { command: 'git push | tail -5 && echo' });
    // A line with a command no rule covers is asked; answering it the same way grants only the new one.
    await answer({ requestId: 'request-2', scope: 'always', reach: 'prefix' });

    expect(harness.rules.rules.map((rule) => rule.ruleContent)).toEqual([
      'Bash(git push:*)',
      'Bash(tail:*)',
      'Bash(echo:*)',
    ]);
  });

  it('leaves deny rules by prefix, and still wants a reason — S-66', async () => {
    await ask('request-1', { command: 'rm -rf build' });

    await expect(answer({ decision: 'deny', reach: 'prefix', reason: null })).rejects.toThrow(
      PermissionReasonRequiredError,
    );

    await answer({ decision: 'deny', reach: 'prefix', reason: 'never' });
    const next = await ask('request-2', { command: 'rm -rf dist' });

    expect(next).toEqual({
      kind: 'settled',
      resolution: expect.objectContaining({ decision: 'deny', via: 'rule' }),
    });
  });

  describe('who answered — S-67', () => {
    it('says nothing of a `via` when a person answered', async () => {
      await ask('request-1', { command: 'git status' });
      await answer({ scope: 'once' });

      expect(harness.broadcaster.last('permission.resolved')).not.toHaveProperty('via');
    });

    it('says nothing of a `via` when the deadline refused', async () => {
      await ask('request-1', { command: 'git status' });

      harness.scheduler.fire();
      await Promise.resolve();

      expect(harness.registry.find('request-1')?.resolution).not.toHaveProperty('via');
    });
  });
});
