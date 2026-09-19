import { beforeEach, describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import {
  PermissionNotOwnedError,
  PermissionReasonRequiredError,
  PermissionRequest,
  PermissionRequestNotFoundError,
  PermissionScopeUnsupportedError,
} from '@domain/permission';
import {
  PERMISSION_OWNER,
  PERMISSION_SESSION,
  aPermissionModule,
  aPermissionQuestion,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

const watching = () => true;
const elsewhere = () => false;

describe('ResolvePermissionUseCase', () => {
  let harness: PermissionHarness;

  beforeEach(async () => {
    harness = aPermissionModule();
    await harness.request.execute(aPermissionQuestion());
    harness.broadcaster.frames.length = 0;
  });

  const answer = (overrides: Record<string, unknown> = {}) =>
    harness.resolve.execute({
      requestId: 'request-1',
      decision: 'allow',
      reason: null,
      scope: 'once',
      userId: PERMISSION_OWNER,
      resolvedFrom: 'web',
      watchesSession: watching,
      ...overrides,
    } as Parameters<typeof harness.resolve.execute>[0]);

  it('settles the request and disarms its deadline — S-50', async () => {
    const settling = await answer();

    expect(settling.won).toBe(true);
    expect(settling.resolution.decision).toBe('allow');
    // Disarmed before anything that can fail: a timeout that fires over a request somebody has
    // already answered would refuse something they allowed.
    expect(harness.scheduler.armed).toBe(0);
  });

  it('tells everybody watching, including whoever answered — S-64', async () => {
    await answer({ decision: 'deny', reason: 'not now' });

    expect(harness.broadcaster.frames).toEqual([
      {
        sessionId: PERMISSION_SESSION.value,
        kind: 'event',
        frame: {
          type: 'permission.resolved',
          payload: {
            requestId: 'request-1',
            decision: 'deny',
            auto: false,
            resolvedBy: PERMISSION_OWNER.value,
            resolvedFrom: 'web',
          },
        },
      },
    ]);
  });

  it('writes the settlement to the history before anything is told', async () => {
    await answer();

    expect(harness.requests.settled).toEqual(['request-1']);
    expect(harness.events.requestIds).toEqual(['request-1']);
  });

  describe('when it loses the race', () => {
    it('reports the decision that actually reached the SDK — S-54', async () => {
      await answer({ decision: 'allow' });

      const second = await answer({
        decision: 'deny',
        reason: 'changed my mind',
        userId: PERMISSION_OWNER,
      });

      expect(second.won).toBe(false);
      expect(second.resolution).toMatchObject({ decision: 'allow', resolvedBy: PERMISSION_OWNER });
    });

    it('says nothing twice', async () => {
      await answer();
      harness.broadcaster.frames.length = 0;

      await answer();

      expect(harness.broadcaster.frames).toEqual([]);
    });

    it('is an ordinary outcome after the deadline has already refused — S-52', async () => {
      harness.scheduler.fire();
      await Promise.resolve();
      harness.broadcaster.frames.length = 0;

      const late = await answer();

      expect(late.won).toBe(false);
      expect(late.resolution).toMatchObject({ decision: 'deny', auto: true });
      expect(harness.broadcaster.frames).toEqual([]);
    });
  });

  describe('refusals', () => {
    it('refuses a request id nobody is holding open — S-56', async () => {
      await expect(answer({ requestId: 'unknown' })).rejects.toThrow(
        PermissionRequestNotFoundError,
      );
    });

    it('refuses a caller who is not watching the session — S-57', async () => {
      // Unlike a session id, a request id is broadcast to everybody attached, so hiding it behind
      // a 404 would protect nothing already unknown.
      await expect(answer({ watchesSession: elsewhere })).rejects.toThrow(PermissionNotOwnedError);
    });

    it('refuses somebody else, even from an attached connection — S-57', async () => {
      await expect(answer({ userId: UserId.create('auth|intruder') })).rejects.toThrow(
        PermissionNotOwnedError,
      );
    });

    it('refuses a refusal with no reason — S-55', async () => {
      await expect(answer({ decision: 'deny', reason: null })).rejects.toThrow(
        PermissionReasonRequiredError,
      );
    });

    it.each(['project', 'always', 'forever'])(
      'refuses the scope %s rather than downgrading it in silence',
      async (scope) => {
        // Somebody who tapped "always" and got "just this once" has been told something untrue
        // about what they authorised.
        await expect(answer({ scope })).rejects.toThrow(PermissionScopeUnsupportedError);
      },
    );
  });

  describe('scope `session`', () => {
    it('leaves a rule behind that answers the next one', async () => {
      await answer({ scope: 'session' });

      expect(harness.registry.rulesOf(PERMISSION_SESSION)).toHaveLength(1);
      expect(
        harness.registry.matchingRule(
          PERMISSION_SESSION,
          PERMISSION_OWNER,
          'Bash',
          { command: 'rm -rf build/' },
          harness.clock.now(),
        ),
      ).not.toBeNull();
    });

    it('leaves none when no honest pattern can be written for the input', async () => {
      // Falling back to the whole tool would grant far more than what was approved, so it falls
      // back to a one-off instead.
      const other = aPermissionModule();
      await other.request.execute(
        aPermissionQuestion({ requestId: 'request-9', input: { note: 'nothing nameable' } }),
      );
      await other.resolve.execute({
        requestId: 'request-9',
        decision: 'allow',
        reason: null,
        scope: 'session',
        userId: PERMISSION_OWNER,
        resolvedFrom: 'web',
        watchesSession: watching,
      });

      expect(other.registry.rulesOf(PERMISSION_SESSION)).toEqual([]);
    });

    it('leaves none for a decision nobody made', async () => {
      const other = aPermissionModule();
      await other.request.execute(aPermissionQuestion({ requestId: 'request-8' }));
      const request = other.registry.find('request-8') as PermissionRequest;

      await other.settlement.settle(request, PermissionRequest.expiry(other.clock.now()), {
        announce: true,
      });

      expect(other.registry.rulesOf(PERMISSION_SESSION)).toEqual([]);
    });
  });
});
