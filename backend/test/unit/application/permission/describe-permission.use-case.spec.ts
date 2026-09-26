import { beforeEach, describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import {
  PermissionNotOwnedError,
  PermissionRequestExpiredError,
  PermissionRequestNotFoundError,
} from '@domain/permission';
import {
  PERMISSION_NOW,
  PERMISSION_OWNER,
  PERMISSION_SESSION,
  aPermissionModule,
  aPermissionQuestion,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

const watching = () => true;

/**
 * Revalidating is asking, not waiting.
 *
 * A push may be late, so the app asks where a request stands before it renders a card. Every case
 * here is one of the answers it can get, and the refusals are checked in the one order that keeps
 * a stranger from learning anything by guessing a session
 * ([D-22](../../../../../docs/plans/02-mobile-approval/decisions.md)).
 */
describe('DescribePermissionUseCase', () => {
  let harness: PermissionHarness;

  beforeEach(async () => {
    harness = aPermissionModule();
    await harness.request.execute(aPermissionQuestion());
  });

  const describeRequest = (overrides: Record<string, unknown> = {}) =>
    harness.describe.execute({
      requestId: 'request-1',
      sessionId: PERMISSION_SESSION.value,
      userId: PERMISSION_OWNER,
      ...overrides,
    } as Parameters<typeof harness.describe.execute>[0]);

  const answer = (overrides: Record<string, unknown> = {}) =>
    harness.resolve.execute({
      requestId: 'request-1',
      decision: 'allow',
      reason: null,
      scope: 'once',
      userId: PERMISSION_OWNER,
      resolvedFrom: 'mobile',
      watchesSession: watching,
      ...overrides,
    } as Parameters<typeof harness.resolve.execute>[0]);

  it('answers a pending request with exactly the payload the socket sent — S-45', () => {
    const state = describeRequest();

    // The very frame `permission.requested` carried, not a second description of it: a card that
    // renders from the revalidation must look the same as one that rendered from the socket.
    expect(state).toEqual({
      status: 'pending',
      request: harness.broadcaster.last('permission.requested'),
      remainingExtensions: 2,
    });
  });

  it('says how many extensions are left once some were spent — S-45', async () => {
    await harness.extend.execute({
      requestId: 'request-1',
      userId: PERMISSION_OWNER,
      watchesSession: watching,
    });

    const state = describeRequest();

    expect(state).toMatchObject({
      status: 'pending',
      remainingExtensions: 1,
      request: {
        expiresAt: new Date(PERMISSION_NOW.getTime() + 2_000).toISOString(),
      },
    });
  });

  it('answers a request a person settled with who did it, and from where — S-46', async () => {
    await answer();

    expect(describeRequest()).toEqual({
      status: 'resolved',
      requestId: 'request-1',
      decision: 'allow',
      auto: false,
      resolvedBy: PERMISSION_OWNER.value,
      resolvedFrom: 'mobile',
    });
  });

  it('answers a refusal a person made as resolved, not as expired — S-46', async () => {
    await answer({ decision: 'deny', reason: 'not on main', resolvedFrom: 'web' });

    expect(describeRequest()).toMatchObject({
      status: 'resolved',
      decision: 'deny',
      auto: false,
      resolvedFrom: 'web',
    });
  });

  it('answers a request a rule settled as automatic, with no origin — S-46', async () => {
    await answer({ scope: 'session' });
    await harness.request.execute(
      aPermissionQuestion({ requestId: 'request-2', input: { command: 'rm -rf build/' } }),
    );

    // Nobody was asked, so nothing says which screen answered; the rule's author is still named,
    // because "allowed by a rule you granted" is the only honest account of who let it run.
    expect(describeRequest({ requestId: 'request-2' })).toEqual({
      status: 'resolved',
      requestId: 'request-2',
      decision: 'allow',
      auto: true,
      resolvedBy: PERMISSION_OWNER.value,
    });
  });

  it('refuses a request the deadline already refused, as gone — S-57', async () => {
    harness.scheduler.fire();
    await Promise.resolve();

    expect(() => describeRequest()).toThrow(PermissionRequestExpiredError);
  });

  it('refuses an id this process never saw', () => {
    expect(() => describeRequest({ requestId: 'unknown' })).toThrow(PermissionRequestNotFoundError);
  });

  it('refuses somebody else, before looking at the session — S-79', () => {
    // The session is wrong too, and the answer is still 403: what a stranger is told must not
    // depend on whether they guessed the session right.
    expect(() =>
      describeRequest({ userId: UserId.create('auth|intruder'), sessionId: 'nonsense' }),
    ).toThrow(PermissionNotOwnedError);
  });

  it('does not find the request under another session — S-80', () => {
    expect(() => describeRequest({ sessionId: '01J0ZZZZZZZZZZZZZZZZZZZZZZ' })).toThrow(
      PermissionRequestNotFoundError,
    );
  });

  it('does not find the request under a session id that is not one — S-80', () => {
    expect(() => describeRequest({ sessionId: 'not-a-ulid' })).toThrow(
      PermissionRequestNotFoundError,
    );
  });

  it('does not find a request whose session has gone', async () => {
    await harness.endSession.execute(PERMISSION_SESSION);

    expect(() => describeRequest()).toThrow(PermissionRequestNotFoundError);
  });
});
