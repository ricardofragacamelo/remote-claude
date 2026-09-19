import { beforeEach, describe, expect, it } from 'vitest';

import {
  PERMISSION_SESSION,
  aPermissionModule,
  aPermissionQuestion,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

/**
 * A session ending with questions still open.
 *
 * Leaving them pending would leave rows in the history claiming a person is still deciding about
 * a session that no longer exists, and a registry that grows by one entry per session ever run.
 */
describe('EndSessionPermissionsUseCase', () => {
  let harness: PermissionHarness;

  beforeEach(async () => {
    harness = aPermissionModule();
    await harness.request.execute(aPermissionQuestion());
    await harness.request.execute(aPermissionQuestion({ requestId: 'request-2' }));
    harness.broadcaster.frames.length = 0;
  });

  it('refuses every question that was still open — S-58', async () => {
    await harness.endSession.execute(PERMISSION_SESSION);

    expect(harness.requests.settled).toEqual(['request-1', 'request-2']);
    expect(harness.events.published.map((event) => event.request.resolution)).toEqual([
      expect.objectContaining({ decision: 'deny', auto: true, resolvedBy: null }),
      expect.objectContaining({ decision: 'deny', auto: true, resolvedBy: null }),
    ]);
  });

  it('tells anybody still holding a card that it is over — S-58', async () => {
    await harness.endSession.execute(PERMISSION_SESSION);

    // The terminal event of the session says nothing about which question went unanswered.
    expect(harness.broadcaster.types).toEqual(['permission.resolved', 'permission.resolved']);
  });

  it('disarms the deadlines it will no longer need', async () => {
    await harness.endSession.execute(PERMISSION_SESSION);

    expect(harness.scheduler.armed).toBe(0);
  });

  it('forgets the session entirely, rules included', async () => {
    await harness.endSession.execute(PERMISSION_SESSION);

    expect(harness.registry.find('request-1')).toBeNull();
    expect(harness.registry.rulesOf(PERMISSION_SESSION)).toEqual([]);
    expect(harness.request.pendingFor(PERMISSION_SESSION)).toEqual([]);
  });

  it('reports a deadline it could not honour instead of letting it escape', async () => {
    // A scheduler callback has nobody to return a promise to, so a rejection there would be an
    // unhandled one — which is how a Node process ends up dying over a database blip.
    harness.requests.failWith = new Error('the database is gone');

    harness.scheduler.fire();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.deadlineFailures).toHaveLength(2);
  });

  it('is safe on a session that left nothing behind', async () => {
    await harness.endSession.execute(PERMISSION_SESSION);
    await harness.endSession.execute(PERMISSION_SESSION);

    expect(harness.requests.settled).toEqual(['request-1', 'request-2']);
  });
});
