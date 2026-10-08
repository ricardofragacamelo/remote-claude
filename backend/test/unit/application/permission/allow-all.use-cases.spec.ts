import { beforeEach, describe, expect, it } from 'vitest';

import { HUMAN_ONLY_TOOLS, answeredByMode } from '@domain/permission';
import { SessionId } from '@domain/session';
import type { GrantPermissionRuleCommand } from '@application/permission';
import {
  PERMISSION_OWNER,
  PERMISSION_PROJECT,
  PERMISSION_SESSION,
  aPermissionModule,
  aPermissionQuestion,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

/**
 * Permitir tudo — plan 23, F1.
 *
 * The mode answers what no rule answered, after the rules and never instead of them, and never a
 * question meant for the person. Every case here is one of those three lines being crossed.
 */
describe('Permitir tudo', () => {
  let harness: PermissionHarness;

  beforeEach(() => {
    harness = aPermissionModule();
  });

  const ask = (overrides: Parameters<typeof aPermissionQuestion>[0] = {}) =>
    harness.request.execute(aPermissionQuestion({ permissionMode: 'allowAll', ...overrides }));

  const grant = (overrides: Partial<GrantPermissionRuleCommand> = {}) =>
    harness.grant.execute({
      userId: PERMISSION_OWNER,
      pattern: 'Bash(rm:*)',
      decision: 'deny',
      scope: 'project',
      projectPath: PERMISSION_PROJECT,
      expiresAt: null,
      ...overrides,
    });

  describe('a request arriving', () => {
    it('allows a shell command no rule answers, without a card or a push — S-09', async () => {
      const outcome = await ask({ input: { command: 'pnpm test' } });

      expect(outcome).toEqual({
        kind: 'settled',
        resolution: expect.objectContaining({
          decision: 'allow',
          auto: true,
          scope: 'once',
          resolvedBy: PERMISSION_OWNER,
          resolvedFrom: null,
          via: 'allowAll',
        }),
      });
      expect(harness.broadcaster.frames.map((entry) => entry.frame.type)).toEqual([
        'permission.resolved',
      ]);
      expect(harness.broadcaster.last('permission.resolved')).toEqual({
        requestId: 'request-1',
        decision: 'allow',
        auto: true,
        resolvedBy: PERMISSION_OWNER.value,
        toolUseId: 'toolu-1',
        via: 'allowAll',
      });
      expect(harness.events.askedIds).toEqual([]);
      expect(harness.scheduler.armed).toBe(0);
    });

    it.each([
      ['Edit', { file_path: '/srv/projects/app/a.ts', old_string: 'a', new_string: 'b' }],
      ['Write', { file_path: '/srv/projects/app/b.ts', content: 'x' }],
      ['WebFetch', { url: 'https://example.com', prompt: 'read' }],
      ['WebSearch', { query: 'vitest' }],
      ['mcp__productdock__list_work_items', {}],
    ])('allows %s too — S-10', async (toolName, input) => {
      const outcome = await ask({ toolName, input });

      expect(outcome.kind).toBe('settled');
    });

    it.each(['AskUserQuestion', 'ExitPlanMode'])(
      'still puts %s to the person — S-11, S-12',
      async (toolName) => {
        const outcome = await ask({ toolName, input: { questions: [] } });

        expect(outcome.kind).toBe('pending');
        expect(harness.broadcaster.last('permission.requested')).toMatchObject({ toolName });
      },
    );

    it('refuses what a deny rule refuses — S-13', async () => {
      await grant();

      const outcome = await ask({ input: { command: 'rm -rf build' } });

      expect(outcome).toEqual({
        kind: 'settled',
        resolution: expect.objectContaining({ decision: 'deny', via: 'rule' }),
      });
    });

    it('refuses a line with a refused command inside it — S-14', async () => {
      await grant();

      const outcome = await ask({ input: { command: 'ls && rm -rf x' } });

      expect(outcome).toEqual({
        kind: 'settled',
        resolution: expect.objectContaining({ decision: 'deny', via: 'rule' }),
      });
    });

    it('lets an allow rule answer as a rule, before the mode — S-15', async () => {
      const rule = await grant({ pattern: 'Bash(git status:*)', decision: 'allow' });

      const outcome = await ask({ input: { command: 'git status --short' } });

      expect(outcome).toEqual({
        kind: 'settled',
        resolution: expect.objectContaining({ ruleId: rule.id, via: 'rule' }),
      });
    });

    it('asks a person when the rules cannot be read — D-12, S-16', async () => {
      // A deny nobody read cannot be traded for an automatic yes.
      const failure = new Error('database down');
      harness.rules.lookupFailure = failure;

      const outcome = await ask({ input: { command: 'pnpm test' } });

      expect(outcome.kind).toBe('pending');
      expect(harness.lookupFailures).toEqual([failure]);
    });

    it('records the approval with its author and no rule — S-17', async () => {
      await ask({ input: { command: 'pnpm test' } });

      // Opened, then written again with its resolution: the row the trail reads.
      expect(harness.requests.opened).toEqual(['request-1']);
      expect(harness.requests.updated).toEqual(['request-1']);
      const resolution = harness.registry.find('request-1')?.resolution;
      expect(resolution).toEqual(
        expect.objectContaining({
          decision: 'allow',
          auto: true,
          resolvedBy: PERMISSION_OWNER,
          via: 'allowAll',
        }),
      );
      expect(resolution).not.toHaveProperty('ruleId');
    });

    it('reads the mode of the moment of the request — S-18', async () => {
      const asked = await harness.request.execute(
        aPermissionQuestion({ requestId: 'request-1', input: { command: 'pnpm test' } }),
      );
      const allowed = await ask({ requestId: 'request-2', input: { command: 'pnpm test' } });

      expect(asked.kind).toBe('pending');
      expect(allowed.kind).toBe('settled');
    });

    it('gives a redelivered request the answer it already has, once — S-19', async () => {
      const first = await ask({ input: { command: 'pnpm test' } });
      const again = await ask({ input: { command: 'pnpm test' } });

      expect(again).toEqual(first);
      expect(harness.requests.opened).toEqual(['request-1']);
      expect(harness.broadcaster.frames).toHaveLength(1);
    });

    it('does not lend the approval to another session with the same request id — S-21', async () => {
      await ask({ input: { command: 'pnpm test' } });

      const other = await harness.request.execute(
        aPermissionQuestion({
          sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY1'),
          input: { command: 'pnpm test' },
        }),
      );

      expect(other.kind).toBe('pending');
    });
  });

  describe('switching the mode with questions open', () => {
    const openThree = async (): Promise<void> => {
      await harness.request.execute(
        aPermissionQuestion({ requestId: 'request-1', input: { command: 'pnpm test' } }),
      );
      await harness.request.execute(
        aPermissionQuestion({
          requestId: 'request-2',
          toolName: 'Edit',
          input: { file_path: '/srv/projects/app/a.ts' },
        }),
      );
      await harness.request.execute(
        aPermissionQuestion({
          requestId: 'request-3',
          toolName: 'AskUserQuestion',
          input: { questions: [] },
        }),
      );
    };

    it('answers the open ones, and leaves the question for the person — S-22', async () => {
      await openThree();

      const answered = await harness.applyMode.execute(PERMISSION_SESSION, 'allowAll');

      expect(answered).toBe(2);
      expect(harness.registry.find('request-1')?.resolution).toMatchObject({ via: 'allowAll' });
      expect(harness.registry.find('request-2')?.resolution).toMatchObject({ via: 'allowAll' });
      expect(harness.registry.find('request-3')?.isPending).toBe(true);
      // The deadlines of the answered ones are gone; the open question keeps its own.
      expect(harness.scheduler.armed).toBe(1);
    });

    it('refuses an open one a rule refuses, rather than approving it — S-23', async () => {
      await harness.request.execute(
        aPermissionQuestion({ requestId: 'request-1', input: { command: 'rm -rf build' } }),
      );
      await grant();

      await harness.applyMode.execute(PERMISSION_SESSION, 'allowAll');

      expect(harness.registry.find('request-1')?.resolution).toMatchObject({
        decision: 'deny',
        via: 'rule',
      });
    });

    it.each(['default', 'acceptEdits', 'plan'] as const)(
      'changes nothing when the session switches to %s — S-24, S-25',
      async (mode) => {
        await openThree();

        const answered = await harness.applyMode.execute(PERMISSION_SESSION, mode);

        expect(answered).toBe(0);
        expect(harness.registry.pendingFor(PERMISSION_SESSION)).toHaveLength(3);
      },
    );

    it('publishes nothing when there is nothing open — S-27', async () => {
      const answered = await harness.applyMode.execute(PERMISSION_SESSION, 'allowAll');

      expect(answered).toBe(0);
      expect(harness.broadcaster.frames).toEqual([]);
    });

    it('does not touch another session`s questions', async () => {
      await harness.request.execute(
        aPermissionQuestion({
          sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY1'),
          input: { command: 'pnpm test' },
        }),
      );

      expect(await harness.applyMode.execute(PERMISSION_SESSION, 'allowAll')).toBe(0);
    });

    it('settles once when a person answers while the mode switches — S-99', async () => {
      await harness.request.execute(
        aPermissionQuestion({ requestId: 'request-1', input: { command: 'pnpm test' } }),
      );

      const [, person] = await Promise.all([
        harness.applyMode.execute(PERMISSION_SESSION, 'allowAll'),
        harness.resolve.execute({
          requestId: 'request-1',
          decision: 'deny',
          reason: 'not now',
          scope: 'once',
          userId: PERMISSION_OWNER,
          resolvedFrom: 'mobile',
          watchesSession: () => true,
        }),
      ]);

      const resolved = harness.broadcaster.frames.filter(
        (entry) => entry.frame.type === 'permission.resolved',
      );
      expect(resolved).toHaveLength(1);
      expect(harness.events.requestIds).toEqual(['request-1']);
      // The person got there while the rules were being read, so theirs is the answer that counts.
      expect(person.resolution).toEqual(harness.registry.find('request-1')?.resolution);
    });
  });
});

describe('the mode alone', () => {
  it.each([...HUMAN_ONLY_TOOLS])('never answers %s', (toolName) => {
    expect(answeredByMode('allowAll', toolName)).toBe(false);
  });

  it.each(['default', 'acceptEdits', 'bypassPermissions', 'plan'] as const)(
    'answers nothing in %s',
    (mode) => {
      expect(answeredByMode(mode, 'Bash')).toBe(false);
    },
  );

  it('answers any other tool in Permitir tudo', () => {
    expect(answeredByMode('allowAll', 'Bash')).toBe(true);
    expect(answeredByMode('allowAll', 'mcp__x__y')).toBe(true);
  });
});
