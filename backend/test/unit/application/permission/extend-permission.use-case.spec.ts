import { beforeEach, describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import {
  PermissionExtensionLimitReachedError,
  PermissionNotOwnedError,
  PermissionRequestExpiredError,
  PermissionRequestNotFoundError,
} from '@domain/permission';
import {
  PERMISSION_NOW,
  PERMISSION_OWNER,
  aPermissionModule,
  aPermissionQuestion,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

const watching = () => true;

/**
 * Extending is mexer na única proteção que existe.
 *
 * Our deadline is the only thing between somebody who walked away and a session that hangs for
 * ever, so every case here is about the ceiling holding, the client never choosing a number, and
 * two devices pressing the same button costing one extension rather than two.
 */
describe('ExtendPermissionUseCase', () => {
  let harness: PermissionHarness;

  beforeEach(async () => {
    harness = aPermissionModule();
    await harness.request.execute(aPermissionQuestion());
    harness.broadcaster.frames.length = 0;
  });

  const extend = (overrides: Record<string, unknown> = {}) =>
    harness.extend.execute({
      requestId: 'request-1',
      userId: PERMISSION_OWNER,
      watchesSession: watching,
      ...overrides,
    } as Parameters<typeof harness.extend.execute>[0]);

  it('moves the deadline and re-arms it — S-91', async () => {
    const extension = await extend();

    expect(extension.changed).toBe(true);
    expect(extension.expiresAt).toEqual(new Date(PERMISSION_NOW.getTime() + 2_000));
    // Re-armed rather than added to: the old deadline is cancelled, so the request cannot be
    // refused at a moment somebody has already pushed past.
    expect(harness.scheduler.armed).toBe(1);
    expect(harness.scheduler.delays).toEqual([1_000, 2_000]);
  });

  it('tells everybody watching the new deadline, and how many are left — S-91', async () => {
    await extend();

    expect(harness.broadcaster.frames).toEqual([
      expect.objectContaining({
        kind: 'event',
        frame: {
          type: 'permission.extended',
          payload: {
            requestId: 'request-1',
            expiresAt: new Date(PERMISSION_NOW.getTime() + 2_000).toISOString(),
            remainingExtensions: 1,
          },
        },
      }),
    ]);
  });

  it('calls the original deadline off, so it cannot refuse what was extended — S-91', async () => {
    await extend();

    // The old timer is cancelled rather than left to fire and find the request "still pending":
    // a deadline that outlives its extension is a refusal landing on a countdown somebody has
    // already pushed past.
    expect(harness.scheduler.cancelledDelays).toEqual([1_000]);
  });

  it('costs one extension when two devices press it together — S-94', async () => {
    await extend();
    harness.broadcaster.frames.length = 0;

    const second = await extend();

    expect(second.changed).toBe(false);
    expect(second.remainingExtensions).toBe(1);
    // Nothing moved, so nothing is announced: the countdown on both screens is already right.
    expect(harness.broadcaster.frames).toEqual([]);
  });

  it('refuses beyond the ceiling, and says so — S-92', async () => {
    await extend();
    harness.clock.advance(2_000);
    await extend();
    harness.clock.advance(2_000);

    await expect(extend()).rejects.toThrow(PermissionExtensionLimitReachedError);
  });

  it('reaches zero remaining before it refuses — S-92', async () => {
    await extend();
    harness.clock.advance(2_000);

    expect((await extend()).remainingExtensions).toBe(0);
  });

  it('records the new deadline in the history before announcing it', async () => {
    // So a process that dies before anybody answers still says how long the question was held
    // open, rather than showing the deadline it started with.
    await extend();

    expect(harness.requests.updated).toEqual(['request-1']);
  });

  it('refuses to extend a request that is already settled — S-93', async () => {
    await harness.resolve.execute({
      requestId: 'request-1',
      decision: 'allow',
      reason: null,
      scope: 'once',
      userId: PERMISSION_OWNER,
      resolvedFrom: 'web',
      watchesSession: watching,
    });

    await expect(extend()).rejects.toThrow(PermissionRequestNotFoundError);
  });

  it('says "too late" when the deadline already refused it — S-51, S-93', async () => {
    harness.scheduler.fire();
    await Promise.resolve();

    await expect(extend()).rejects.toThrow(PermissionRequestExpiredError);
  });

  it('refuses an unknown request — S-93', async () => {
    await expect(extend({ requestId: 'unknown' })).rejects.toThrow(PermissionRequestNotFoundError);
  });

  it('refuses a caller who is not watching the session', async () => {
    await expect(extend({ watchesSession: () => false })).rejects.toThrow(PermissionNotOwnedError);
  });

  it('refuses somebody else', async () => {
    await expect(extend({ userId: UserId.create('auth|intruder') })).rejects.toThrow(
      PermissionNotOwnedError,
    );
  });
});
