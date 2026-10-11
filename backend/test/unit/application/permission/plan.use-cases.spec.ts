import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionAnswersInvalidError } from '@domain/permission';
import type { PermissionMode } from '@domain/session';
import {
  PERMISSION_NOW,
  PERMISSION_OWNER,
  PERMISSION_SESSION,
  TEST_PERMISSION_SETTINGS,
  aPermissionModule,
  aPermissionQuestion,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

/** An `ExitPlanMode` as the SDK hands it to `canUseTool`. */
const PLAN = { plan: '# Plan\n\n1. Write the README', planFilePath: '/home/u/.claude/plans/p.md' };

/** The plan of {@link PLAN}, presented in a given mode. */
const presenting = (permissionMode: PermissionMode = 'readOnly', requestId = 'request-1') =>
  aPermissionQuestion({ requestId, toolName: 'ExitPlanMode', input: PLAN, permissionMode });

describe('a plan of the agent — plan 28, B-20', () => {
  let harness: PermissionHarness;

  beforeEach(() => {
    harness = aPermissionModule();
  });

  const resolve = (overrides: Record<string, unknown> = {}) =>
    harness.resolve.execute({
      requestId: 'request-1',
      decision: 'allow',
      reason: null,
      scope: 'once',
      answers: null,
      userId: PERMISSION_OWNER,
      resolvedFrom: 'web',
      watchesSession: () => true,
      ...overrides,
    } as Parameters<typeof harness.resolve.execute>[0]);

  describe('the request — S-61', () => {
    it('is published as a plan: its markdown and file, refusal first, nothing to authorise', async () => {
      await harness.request.execute(presenting());

      const payload = harness.broadcaster.last('permission.requested');
      expect(payload).toMatchObject({
        kind: 'plan',
        title: 'permission.tool.plan',
        defaultToNo: true,
        suggestions: [],
        reaches: [],
        interaction: {
          kind: 'plan',
          markdown: '# Plan\n\n1. Write the README',
          path: '/home/u/.claude/plans/p.md',
        },
      });
      expect(payload).not.toHaveProperty('description');
    });

    it('waits as long as a question does', async () => {
      await harness.request.execute(presenting());

      expect(harness.registry.find('request-1')?.expiresAt).toEqual(
        new Date(PERMISSION_NOW.getTime() + TEST_PERMISSION_SETTINGS.questionTimeoutMs),
      );
    });

    it.each<PermissionMode>(['allowAll', 'readOnly', 'acceptEdits', 'ask'])(
      'is put to the person in %s — never approved by the mode',
      async (mode) => {
        const outcome = await harness.request.execute(presenting(mode));

        expect(outcome.kind).toBe('pending');
        expect(harness.broadcaster.last('permission.requested')).toMatchObject({ kind: 'plan' });
      },
    );

    it('is replayed with its plan to a client that reattaches', async () => {
      await harness.request.execute(presenting());

      expect(harness.request.pendingFor(PERMISSION_SESSION)[0]).toMatchObject({
        interaction: { kind: 'plan' },
      });
    });
  });

  describe('the approval — S-61, S-63', () => {
    beforeEach(async () => {
      await harness.request.execute(presenting());
      harness.broadcaster.frames.length = 0;
    });

    it('settles an allow with nothing in it, and publishes it', async () => {
      const settling = await resolve();

      expect(settling.won).toBe(true);
      expect(settling.resolution.answers).toBeUndefined();
      expect(harness.broadcaster.last('permission.resolved')).toMatchObject({
        requestId: 'request-1',
        decision: 'allow',
      });
    });

    it('refuses answers on a plan, and leaves it open', async () => {
      await expect(
        resolve({ answers: [{ questionId: 'q1', selected: ['A'], other: null }] }),
      ).rejects.toBeInstanceOf(PermissionAnswersInvalidError);

      expect(harness.registry.find('request-1')?.isPending).toBe(true);
      expect((await resolve()).won).toBe(true);
    });

    it('leaves no rule behind, whatever scope the answer says', async () => {
      await resolve({ scope: 'session' });

      expect(harness.registry.rulesOf(PERMISSION_SESSION)).toEqual([]);
    });

    it('lets the first of two approvals win, and acks the second — S-63', async () => {
      const [first, second] = await Promise.all([resolve(), resolve({ resolvedFrom: 'mobile' })]);

      expect([first.won, second.won].sort()).toEqual([false, true]);
      expect(second.resolution).toEqual(first.resolution);
      expect(
        harness.broadcaster.frames.filter((entry) => entry.frame.type === 'permission.resolved'),
      ).toHaveLength(1);
      expect(harness.events.requestIds).toEqual(['request-1']);
    });

    it('describes the plan while it waits, and with how it ended after', async () => {
      const query = {
        requestId: 'request-1',
        sessionId: PERMISSION_SESSION.value,
        userId: PERMISSION_OWNER,
      };

      expect(harness.describe.execute(query)).toMatchObject({
        status: 'pending',
        request: { interaction: { kind: 'plan', path: '/home/u/.claude/plans/p.md' } },
      });

      await resolve();

      expect(harness.describe.execute(query)).toMatchObject({
        status: 'resolved',
        decision: 'allow',
        interaction: { kind: 'plan', markdown: '# Plan\n\n1. Write the README' },
      });
    });
  });
});
