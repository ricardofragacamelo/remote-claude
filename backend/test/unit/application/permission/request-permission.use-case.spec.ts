import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionRequest } from '@domain/permission';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import {
  PERMISSION_OWNER,
  PERMISSION_SESSION,
  aPermissionModule,
  aPermissionQuestion,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

/**
 * The four steps `canUseTool` takes, and the order they have to happen in.
 *
 * Every case here is about one of them being skipped or repeated, because that is how a
 * permission system fails: not by refusing something it should have allowed, but by answering a
 * question it never asked, or asking one it has already answered.
 */
describe('RequestPermissionUseCase', () => {
  let harness: PermissionHarness;

  beforeEach(() => {
    harness = aPermissionModule();
  });

  it('records the question before it puts it on anybody`s screen', async () => {
    const outcome = await harness.request.execute(aPermissionQuestion());

    expect(outcome.kind).toBe('pending');
    expect(harness.requests.opened).toEqual(['request-1']);
    expect(harness.broadcaster.frames).toEqual([
      expect.objectContaining({ kind: 'request', frame: expect.anything() }),
    ]);
  });

  it('publishes a question a human can actually decide on', async () => {
    await harness.request.execute(aPermissionQuestion());

    expect(harness.broadcaster.last('permission.requested')).toMatchObject({
      requestId: 'request-1',
      toolUseId: 'toolu-1',
      toolName: 'Bash',
      // A key, never prose: the server does not send sentences, and the detail is the command
      // itself rather than a description of it.
      title: 'permission.tool.Bash',
      description: 'rm -rf build/',
      riskHint: 'destructive',
      defaultToNo: true,
      suggestions: [
        { scope: 'once', labelKey: 'permission.scope.once' },
        { scope: 'session', labelKey: 'permission.scope.session' },
      ],
    });
  });

  it('publishes an empty tool use id rather than breaking a required field', async () => {
    // The SDK does not always give one, and the contract requires the field. An empty string is a
    // truthful "there was none"; a missing field is a frame a generated client refuses.
    await harness.request.execute(aPermissionQuestion({ toolUseId: null, input: { note: 'x' } }));

    expect(harness.broadcaster.last('permission.requested')).toMatchObject({ toolUseId: '' });
    // And no `description`, because nothing in that input is a thing a person could read.
    expect(harness.broadcaster.last('permission.requested')).not.toHaveProperty('description');
  });

  it('arms the one deadline there is — S-63', async () => {
    // The CLI imposes none: a permission was measured hanging for 150 s with nothing giving up.
    await harness.request.execute(aPermissionQuestion());

    expect(harness.scheduler.delays).toEqual([1_000]);
  });

  it('refuses when the deadline passes, with nobody having answered — S-51, S-63', async () => {
    await harness.request.execute(aPermissionQuestion());

    harness.scheduler.fire();
    await Promise.resolve();

    expect(harness.registry.find('request-1')?.resolution).toMatchObject({
      decision: 'deny',
      auto: true,
      resolvedBy: null,
    });
  });

  describe('when the same question arrives twice', () => {
    it('returns the answer it already has, without asking again — S-53', async () => {
      // The SDK redelivers a pending call after a transport gap. Asking twice would put a second
      // card on screen for one invocation; answering twice would run the tool twice.
      await harness.request.execute(aPermissionQuestion());
      await harness.resolve.execute({
        requestId: 'request-1',
        decision: 'allow',
        reason: null,
        scope: 'once',
        userId: PERMISSION_OWNER,
        resolvedFrom: 'web',
        watchesSession: () => true,
      });

      const again = await harness.request.execute(aPermissionQuestion());

      expect(again).toEqual({
        kind: 'settled',
        resolution: expect.objectContaining({ decision: 'allow' }),
      });
      expect(harness.broadcaster.frames.filter((f) => f.kind === 'request')).toHaveLength(1);
    });

    it('hands back the pending one rather than opening a second', async () => {
      await harness.request.execute(aPermissionQuestion());
      const again = await harness.request.execute(aPermissionQuestion());

      expect(again.kind).toBe('pending');
      expect(harness.requests.opened).toEqual(['request-1']);
    });

    it('starts a new question when the id belongs to another session', async () => {
      // `requestId` is minted by the SDK and expected to be unique, but inheriting another
      // session's verdict on the strength of that expectation would authorise a tool nobody was
      // asked about.
      await harness.request.execute(aPermissionQuestion());

      const elsewhere = await harness.request.execute(
        aPermissionQuestion({ sessionId: SessionId.create('01J0ZZZZZZZZZZZZZZZZZZZZZZ') }),
      );

      expect(elsewhere.kind).toBe('pending');
      expect(harness.requests.opened).toEqual(['request-1', 'request-1']);
    });
  });

  describe('when a rule of this session already answers it', () => {
    beforeEach(async () => {
      await harness.request.execute(aPermissionQuestion({ input: { command: 'git status' } }));
      await harness.resolve.execute({
        requestId: 'request-1',
        decision: 'allow',
        reason: null,
        scope: 'session',
        userId: PERMISSION_OWNER,
        resolvedFrom: 'web',
        watchesSession: () => true,
      });
      harness.broadcaster.frames.length = 0;
    });

    it('settles it without disturbing anybody — S-60', async () => {
      const outcome = await harness.request.execute(
        aPermissionQuestion({ requestId: 'request-2', input: { command: 'git status' } }),
      );

      expect(outcome).toEqual({
        kind: 'settled',
        resolution: expect.objectContaining({ decision: 'allow', auto: true }),
      });
      // Nothing was asked, so there is nothing to resolve on screen: publishing either frame
      // would put a card up only to take it away again.
      expect(harness.broadcaster.frames).toEqual([]);
      expect(harness.scheduler.armed).toBe(0);
    });

    it('still records it, and still tells the internal bus', async () => {
      await harness.request.execute(
        aPermissionQuestion({ requestId: 'request-2', input: { command: 'git status' } }),
      );

      expect(harness.requests.settled).toContain('request-2');
      expect(harness.events.requestIds).toContain('request-2');
    });

    it('does not answer a different command — S-61', async () => {
      // The rule was written from the invocation, so it is as narrow as what was approved: a
      // person who allowed `git status` has said nothing about `rm -rf build`.
      const outcome = await harness.request.execute(
        aPermissionQuestion({ requestId: 'request-3', input: { command: 'rm -rf build' } }),
      );

      expect(outcome.kind).toBe('pending');
    });

    it('does not answer another person`s question', async () => {
      const outcome = await harness.request.execute(
        aPermissionQuestion({
          requestId: 'request-4',
          input: { command: 'git status' },
          userId: UserId.create('auth|somebody-else'),
        }),
      );

      expect(outcome.kind).toBe('pending');
    });
  });

  it('leaves no rule behind for a one-off yes — S-61', async () => {
    await harness.request.execute(aPermissionQuestion({ input: { command: 'git status' } }));
    await harness.resolve.execute({
      requestId: 'request-1',
      decision: 'allow',
      reason: null,
      scope: 'once',
      userId: PERMISSION_OWNER,
      resolvedFrom: 'web',
      watchesSession: () => true,
    });

    const next = await harness.request.execute(
      aPermissionQuestion({ requestId: 'request-2', input: { command: 'git status' } }),
    );

    expect(next.kind).toBe('pending');
    expect(harness.registry.rulesOf(PERMISSION_SESSION)).toEqual([]);
  });

  it('lists the questions that are still open, and only those', async () => {
    await harness.request.execute(aPermissionQuestion());
    await harness.request.execute(aPermissionQuestion({ requestId: 'request-2' }));
    await harness.settlement.settle(
      harness.registry.find('request-1') as PermissionRequest,
      PermissionRequest.expiry(harness.clock.now()),
      { announce: true },
    );

    expect(harness.request.pendingFor(PERMISSION_SESSION)).toEqual([
      expect.objectContaining({ requestId: 'request-2' }),
    ]);
  });
});
