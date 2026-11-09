import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserId } from '@domain/auth';
import {
  PermissionRuleExpiryInvalidError,
  PermissionRuleExpiryTooLongError,
  PermissionRuleIfMatchRequiredError,
  PermissionRuleNotFoundError,
  PermissionRuleNotOwnedError,
  PermissionRuleRestoreWindowClosedError,
  PermissionRuleTooBroadError,
  ruleEtag,
} from '@domain/permission';
import { PermissionRule } from '@domain/permission';
import type { GrantPermissionRuleCommand } from '@application/permission';
import {
  PERMISSION_NOW,
  PERMISSION_OWNER,
  PERMISSION_PROJECT,
  TEST_PERMISSION_SETTINGS,
  aPermissionModule,
  aPermissionQuestion,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

/**
 * The rules management screen's own backend — plan 15, F1, B-12 (changing a validity) and B-13
 * (revoking in a lot, and undoing it). The matcher, the breadth and the folder reach are proved by
 * boundary elsewhere (B-08, B-09); what is proved here is what these three use cases do around
 * them: the fixed order of refusals, the race the write itself decides, and the lot's atomicity.
 */
describe('permission rules — management (plan 15, B-12, B-13)', () => {
  let harness: PermissionHarness;
  const stranger = UserId.create('auth|rules-stranger');

  beforeEach(() => {
    harness = aPermissionModule();
  });

  const grant = (
    overrides: Partial<Omit<GrantPermissionRuleCommand, 'projectPath'>> & {
      readonly projectPath?: string | null;
    } = {},
  ): Promise<PermissionRule> => {
    const { projectPath, ...rest } = overrides;

    return harness.grant.execute({
      userId: PERMISSION_OWNER,
      pattern: 'shell(git status:*)',
      decision: 'allow',
      scope: 'project',
      projectPath: { trusted: PERMISSION_PROJECT },
      expiresAt: null,
      grantedVia: 'approval',
      ...(projectPath !== undefined && {
        projectPath: projectPath === null ? null : { trusted: projectPath },
      }),
      ...rest,
    });
  };

  describe('changing a validity — B-12', () => {
    it('extends, and records the before and after — S-65, S-66', async () => {
      const rule = await grant();
      const extended = new Date(rule.expiresAt.getTime() + 1_000);

      const updated = await harness.changeExpiry.execute(
        PERMISSION_OWNER,
        rule.id,
        extended,
        ruleEtag(rule),
      );

      expect(updated.expiresAt).toEqual(extended);
      expect(harness.trail.kinds).toEqual([
        'permission.ruleGranted',
        'permission.ruleExpiryChanged',
      ]);
      expect(harness.trail.appended.at(-1)?.details).toEqual({
        from: rule.expiresAt.toISOString(),
        to: extended.toISOString(),
      });
    });

    it('shortens the same way', async () => {
      const rule = await grant();
      const shortened = new Date(rule.expiresAt.getTime() - 1_000);

      const updated = await harness.changeExpiry.execute(
        PERMISSION_OWNER,
        rule.id,
        shortened,
        ruleEtag(rule),
      );

      expect(updated.expiresAt).toEqual(shortened);
    });

    it('accepts a new validity exactly at the ceiling, counted from now — S-66, D-14', async () => {
      const rule = await grant();
      const atCeiling = new Date(
        harness.clock.now().getTime() + TEST_PERMISSION_SETTINGS.ruleMaxLifetimeMs,
      );

      const updated = await harness.changeExpiry.execute(
        PERMISSION_OWNER,
        rule.id,
        atCeiling,
        ruleEtag(rule),
      );

      expect(updated.expiresAt).toEqual(atCeiling);
    });

    it('uses `deny`s own, longer ceiling — D-04, D-14', async () => {
      const rule = await grant({ decision: 'deny', expiresAt: null, grantedVia: 'request' });
      const atCeiling = new Date(
        harness.clock.now().getTime() + TEST_PERMISSION_SETTINGS.ruleDenyMaxLifetimeMs,
      );

      const updated = await harness.changeExpiry.execute(
        PERMISSION_OWNER,
        rule.id,
        atCeiling,
        ruleEtag(rule),
      );

      expect(updated.expiresAt).toEqual(atCeiling);
    });

    it('refuses a validity one millisecond past the ceiling, counted from now — D-14', async () => {
      const rule = await grant();
      const overCeiling = new Date(
        harness.clock.now().getTime() + TEST_PERMISSION_SETTINGS.ruleMaxLifetimeMs + 1,
      );

      await expect(
        harness.changeExpiry.execute(PERMISSION_OWNER, rule.id, overCeiling, ruleEtag(rule)),
      ).rejects.toThrow(PermissionRuleExpiryTooLongError);
    });

    it('refuses a validity that is not in the future — S-67', async () => {
      const rule = await grant();

      await expect(
        harness.changeExpiry.execute(
          PERMISSION_OWNER,
          rule.id,
          harness.clock.now(),
          ruleEtag(rule),
        ),
      ).rejects.toThrow(PermissionRuleExpiryInvalidError);
    });

    it('writes nothing and records nothing when the validity sent is the one it already has — S-73', async () => {
      const rule = await grant();

      const same = await harness.changeExpiry.execute(
        PERMISSION_OWNER,
        rule.id,
        rule.expiresAt,
        ruleEtag(rule),
      );

      expect(same).toEqual(rule);
      expect(harness.trail.kinds).toEqual(['permission.ruleGranted']);
    });

    it('refuses with no If-Match — S-72, the precondition comes before the rule`s own state', async () => {
      const rule = await grant();

      await expect(
        harness.changeExpiry.execute(
          PERMISSION_OWNER,
          rule.id,
          new Date(rule.expiresAt.getTime() + 1),
          null,
        ),
      ).rejects.toThrow(PermissionRuleIfMatchRequiredError);
    });

    it('refuses a stale If-Match, naming the current one — S-72', async () => {
      const rule = await grant();

      await expect(
        harness.changeExpiry.execute(
          PERMISSION_OWNER,
          rule.id,
          new Date(rule.expiresAt.getTime() + 1),
          'not-the-etag',
        ),
      ).rejects.toMatchObject({
        code: 'PERMISSION_RULE_CHANGED',
        params: { currentEtag: ruleEtag(rule) },
      });
    });

    it('refuses a revoked rule with its state, even with a fresh If-Match — S-70, S-72', async () => {
      const rule = await grant();
      await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      await expect(
        harness.changeExpiry.execute(
          PERMISSION_OWNER,
          rule.id,
          new Date(rule.expiresAt.getTime() + 1),
          ruleEtag(rule),
        ),
      ).rejects.toMatchObject({ code: 'PERMISSION_RULE_STATE_CONFLICT', status: 'revoked' });
    });

    it('refuses a rule that does not exist', async () => {
      await expect(
        harness.changeExpiry.execute(PERMISSION_OWNER, 'no-such-rule', PERMISSION_NOW, 'etag'),
      ).rejects.toThrow(PermissionRuleNotFoundError);
    });

    it('refuses somebody else`s rule, which keeps applying to its owner', async () => {
      const rule = await grant();

      await expect(
        harness.changeExpiry.execute(stranger, rule.id, PERMISSION_NOW, ruleEtag(rule)),
      ).rejects.toThrow(PermissionRuleNotOwnedError);
    });

    it('refuses outright a rule already revoked before this call ever reads it — S-70', async () => {
      const rule = await grant();
      const etag = ruleEtag(rule);
      await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      await expect(
        harness.changeExpiry.execute(
          PERMISSION_OWNER,
          rule.id,
          new Date(rule.expiresAt.getTime() + 1),
          etag,
        ),
      ).rejects.toMatchObject({ code: 'PERMISSION_RULE_STATE_CONFLICT', status: 'revoked' });
    });

    it('loses a race with a revocation that lands between its own checks and its write — the write decides, not an earlier read — S-74', async () => {
      const rule = await grant();
      const etag = ruleEtag(rule);
      const write = harness.rules.changeExpiry.bind(harness.rules);
      vi.spyOn(harness.rules, 'changeExpiry').mockImplementationOnce(async (...args) => {
        // This call already passed its own state and `If-Match` checks against the active rule —
        // the revocation below only reaches the row once this call's write does.
        await harness.revoke.execute(PERMISSION_OWNER, rule.id);
        return write(...args);
      });

      await expect(
        harness.changeExpiry.execute(
          PERMISSION_OWNER,
          rule.id,
          new Date(rule.expiresAt.getTime() + 1_000),
          etag,
        ),
      ).rejects.toMatchObject({ code: 'PERMISSION_RULE_STATE_CONFLICT', status: 'revoked' });
    });

    it('loses a race with another PATCH that lands between its own checks and its write — S-75', async () => {
      const rule = await grant();
      const etag = ruleEtag(rule);
      const write = harness.rules.changeExpiry.bind(harness.rules);
      vi.spyOn(harness.rules, 'changeExpiry').mockImplementationOnce(async (...args) => {
        // Another `PATCH` — with the same `If-Match`, the same race a client retrying a timeout
        // could cause — commits its own, smaller extension first.
        await write(rule.id, rule.expiresAt, new Date(rule.expiresAt.getTime() + 500));
        return write(...args);
      });

      await expect(
        harness.changeExpiry.execute(
          PERMISSION_OWNER,
          rule.id,
          new Date(rule.expiresAt.getTime() + 1_000),
          etag,
        ),
      ).rejects.toMatchObject({ code: 'PERMISSION_RULE_CHANGED' });
    });

    it('an extension the trail cannot record is undone — the rule keeps its old validity — S-77', async () => {
      const rule = await grant();
      const etag = ruleEtag(rule);
      harness.trail.failAt = { attempt: 1, error: new Error('trail unavailable') };

      await expect(
        harness.changeExpiry.execute(
          PERMISSION_OWNER,
          rule.id,
          new Date(rule.expiresAt.getTime() + 1_000),
          etag,
        ),
      ).rejects.toThrow('trail unavailable');

      expect((await harness.rules.findById(rule.id))?.expiresAt).toEqual(rule.expiresAt);
    });

    it('a shortening the trail cannot record stays — the safer direction — and still fails — S-77', async () => {
      const rule = await grant();
      const etag = ruleEtag(rule);
      const shortened = new Date(rule.expiresAt.getTime() - 1_000);
      harness.trail.failAt = { attempt: 1, error: new Error('trail unavailable') };

      await expect(
        harness.changeExpiry.execute(PERMISSION_OWNER, rule.id, shortened, etag),
      ).rejects.toThrow('trail unavailable');

      expect((await harness.rules.findById(rule.id))?.expiresAt).toEqual(shortened);
    });

    it('a shortened rule stops answering at once — S-76', async () => {
      const rule = await grant();

      await harness.changeExpiry.execute(
        PERMISSION_OWNER,
        rule.id,
        new Date(harness.clock.now().getTime() + 1),
        ruleEtag(rule),
      );
      harness.clock.advance(1);

      const outcome = await harness.request.execute(
        aPermissionQuestion({ input: { command: 'git status --short' } }),
      );
      expect(outcome.kind).toBe('pending');
    });

    it('refuses a disabled rule with its state — it never comes back by a PATCH — S-226', async () => {
      const disabled = PermissionRule.restore({
        id: 'rule-disabled',
        userId: PERMISSION_OWNER,
        sessionId: null,
        projectPath: null,
        pattern: 'Bash(git status:*)',
        decision: 'allow',
        scope: 'always',
        createdAt: PERMISSION_NOW,
        expiresAt: new Date(PERMISSION_NOW.getTime() + 60_000),
        revokedAt: null,
        disabledReason: 'untranslatable',
      });
      await harness.rules.grant(disabled, PERMISSION_NOW);

      await expect(
        harness.changeExpiry.execute(
          PERMISSION_OWNER,
          disabled.id,
          new Date(PERMISSION_NOW.getTime() + 120_000),
          'whatever',
        ),
      ).rejects.toMatchObject({ code: 'PERMISSION_RULE_STATE_CONFLICT', status: 'disabled' });
    });
  });

  describe('revoking a lot, and undoing it — B-13', () => {
    it('revokes several at once, each with its own event sharing one batchId — S-80, S-83', async () => {
      const first = await grant({ pattern: 'shell(git status:*)' });
      const second = await grant({ pattern: 'shell(git diff:*)' });

      const revoked = await harness.revokeBatch.execute(PERMISSION_OWNER, [first.id, second.id]);

      expect(revoked.map((rule) => rule.revokedAt)).toEqual([
        harness.clock.now(),
        harness.clock.now(),
      ]);
      const events = harness.trail.appended.filter(
        (event) => event.kind === 'permission.ruleRevoked',
      );
      expect(events).toHaveLength(2);
      expect(events[0]?.details).toEqual(events[1]?.details);
      expect(events[0]?.details).toMatchObject({ batchId: expect.any(String) });
    });

    it('is idempotent per id — one already revoked comes back unchanged, no second event — S-85', async () => {
      const rule = await grant();
      await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      const revoked = await harness.revokeBatch.execute(PERMISSION_OWNER, [rule.id]);

      expect(revoked).toHaveLength(1);
      expect(revoked[0]?.revokedAt).toEqual(
        await (await harness.rules.findById(rule.id))!.revokedAt,
      );
      expect(
        harness.trail.appended.filter((event) => event.kind === 'permission.ruleRevoked'),
      ).toHaveLength(1);
    });

    it('revokes nothing when one id in the lot does not exist — S-81, S-82', async () => {
      const rule = await grant();

      await expect(
        harness.revokeBatch.execute(PERMISSION_OWNER, [rule.id, 'no-such-rule']),
      ).rejects.toThrow(PermissionRuleNotFoundError);

      expect((await harness.rules.findById(rule.id))?.revokedAt).toBeNull();
      expect(harness.trail.kinds).toEqual(['permission.ruleGranted']);
    });

    it('revokes nothing when one id in the lot is somebody else`s', async () => {
      const mine = await grant();
      const theirs = await harness.grant.execute({
        userId: stranger,
        pattern: 'shell(git log:*)',
        decision: 'allow',
        scope: 'always',
        projectPath: null,
        expiresAt: null,
        grantedVia: 'approval',
      });

      await expect(
        harness.revokeBatch.execute(PERMISSION_OWNER, [mine.id, theirs.id]),
      ).rejects.toThrow(PermissionRuleNotOwnedError);

      expect((await harness.rules.findById(mine.id))?.revokedAt).toBeNull();
    });

    it('`DELETE` of one rule is the batch of one — same event shape, with a batchId', async () => {
      const rule = await grant();

      await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      expect(harness.trail.appended.at(-1)).toMatchObject({
        kind: 'permission.ruleRevoked',
        details: { batchId: expect.any(String) },
      });
    });

    it('a live session asks again after a lot is revoked — S-86', async () => {
      const rule = await grant();
      const asks = (requestId: string) =>
        harness.request.execute(
          aPermissionQuestion({ requestId, input: { command: 'git status --short' } }),
        );
      expect((await asks('r-1')).kind).toBe('settled');

      await harness.revokeBatch.execute(PERMISSION_OWNER, [rule.id]);

      expect((await asks('r-2')).kind).toBe('pending');
    });

    it('restores a revoked rule within the window — S-88', async () => {
      const rule = await grant();
      await harness.revoke.execute(PERMISSION_OWNER, rule.id);
      harness.clock.advance(TEST_PERMISSION_SETTINGS.ruleRestoreWindowMs - 1);

      const [restored] = await harness.restore.execute(PERMISSION_OWNER, [rule.id]);

      expect(restored?.ruleContent).toBe(rule.ruleContent);
      expect(restored?.grantedVia).toBe('restore');
      expect(restored?.restoredFrom).toBe(rule.id);
      expect(restored?.revokedAt).toBeNull();
    });

    it('refuses past the undo window — S-88', async () => {
      const rule = await grant();
      await harness.revoke.execute(PERMISSION_OWNER, rule.id);
      harness.clock.advance(TEST_PERMISSION_SETTINGS.ruleRestoreWindowMs + 1);

      await expect(harness.restore.execute(PERMISSION_OWNER, [rule.id])).rejects.toThrow(
        PermissionRuleRestoreWindowClosedError,
      );
    });

    it('refuses a rule that was never revoked — S-89', async () => {
      const rule = await grant();

      await expect(harness.restore.execute(PERMISSION_OWNER, [rule.id])).rejects.toMatchObject({
        code: 'PERMISSION_RULE_STATE_CONFLICT',
        status: 'active',
      });
    });

    it('refuses a disabled rule the same way — it is not revoked, and never restores — S-226', async () => {
      const disabled = PermissionRule.restore({
        id: 'rule-disabled',
        userId: PERMISSION_OWNER,
        sessionId: null,
        projectPath: null,
        pattern: 'Bash(git status:*)',
        decision: 'allow',
        scope: 'always',
        createdAt: PERMISSION_NOW,
        expiresAt: new Date(PERMISSION_NOW.getTime() + 60_000),
        revokedAt: null,
        disabledReason: 'untranslatable',
      });
      await harness.rules.grant(disabled, PERMISSION_NOW);

      await expect(harness.restore.execute(PERMISSION_OWNER, [disabled.id])).rejects.toMatchObject({
        code: 'PERMISSION_RULE_STATE_CONFLICT',
        status: 'disabled',
      });
    });

    it('confers breadth again — an unbounded rule from before does not come back — S-90', async () => {
      const rule = await grant({ pattern: 'shell', grantedVia: 'approval' });
      await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      await expect(harness.restore.execute(PERMISSION_OWNER, [rule.id])).rejects.toThrow(
        PermissionRuleTooBroadError,
      );
    });

    it('refuses a rule whose own validity has, in the meantime, passed — S-92', async () => {
      const rule = await grant({
        expiresAt: new Date(harness.clock.now().getTime() + 1_000),
      });
      await harness.revoke.execute(PERMISSION_OWNER, rule.id);
      harness.clock.advance(1_000);

      await expect(harness.restore.execute(PERMISSION_OWNER, [rule.id])).rejects.toThrow(
        PermissionRuleExpiryInvalidError,
      );
    });

    it('restoring twice gives one rule, idempotent between actives — S-91', async () => {
      const rule = await grant();
      await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      const [first] = await harness.restore.execute(PERMISSION_OWNER, [rule.id]);
      await harness.revoke.execute(PERMISSION_OWNER, first!.id);
      harness.clock.advance(1);
      const [second] = await harness.restore.execute(PERMISSION_OWNER, [first!.id]);

      // Each restore stands on its own grant call, so a rule revoked and restored again is a
      // second row — not the same id as the first restore, but the same content.
      expect(second?.ruleContent).toBe(first?.ruleContent);
    });

    it('refuses to restore somebody else`s rule — S-93', async () => {
      const rule = await grant();
      await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      await expect(harness.restore.execute(stranger, [rule.id])).rejects.toThrow(
        PermissionRuleNotOwnedError,
      );
    });

    it('refuses a rule that does not exist', async () => {
      await expect(harness.restore.execute(PERMISSION_OWNER, ['no-such-rule'])).rejects.toThrow(
        PermissionRuleNotFoundError,
      );
    });
  });
});
