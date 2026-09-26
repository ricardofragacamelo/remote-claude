import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserId } from '@domain/auth';
import {
  PermissionRuleExpiryInvalidError,
  PermissionRuleExpiryTooLongError,
  PermissionRuleNotFoundError,
  PermissionRuleNotOwnedError,
  PermissionRulePatternInvalidError,
  PermissionScopeUnsupportedError,
} from '@domain/permission';
import type { PermissionRule } from '@domain/permission';
import { SessionId } from '@domain/session';
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
 * The rules that outlive a session, through the use cases — plan 03, F0.
 *
 * The matcher and the precedence are proved by boundary in the domain; what is proved here is what
 * the application does with them: a rule answers before anybody is disturbed, a revoked one stops
 * answering at once, and every grant and revocation reaches the trail exactly once.
 */
describe('permission rules', () => {
  let harness: PermissionHarness;

  /** Another session of the same person, in the same project. */
  const anotherSession = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY1');
  const stranger = UserId.create('auth|stranger');

  beforeEach(() => {
    harness = aPermissionModule();
  });

  const grant = (overrides: Partial<GrantPermissionRuleCommand> = {}): Promise<PermissionRule> =>
    harness.grant.execute({
      userId: PERMISSION_OWNER,
      pattern: 'Bash(git status:*)',
      decision: 'allow',
      scope: 'project',
      projectPath: PERMISSION_PROJECT,
      expiresAt: null,
      ...overrides,
    });

  const ask = (overrides: Parameters<typeof aPermissionQuestion>[0] = {}) =>
    harness.request.execute(
      aPermissionQuestion({
        requestId: 'request-1',
        sessionId: anotherSession,
        input: { command: 'git status --short' },
        ...overrides,
      }),
    );

  describe('answering a request', () => {
    it('answers from another session of the same project — S-01', async () => {
      const rule = await grant();

      const outcome = await ask();

      expect(outcome).toEqual({
        kind: 'settled',
        resolution: expect.objectContaining({
          decision: 'allow',
          auto: true,
          scope: 'project',
          ruleId: rule.id,
          resolvedBy: PERMISSION_OWNER,
        }),
      });
    });

    it('answers in any project when the rule is `always` — S-02', async () => {
      await grant({ scope: 'always', projectPath: null });

      expect((await ask({ projectPath: '/srv/projects/elsewhere' })).kind).toBe('settled');
      expect((await ask({ requestId: 'request-2', projectPath: null })).kind).toBe('settled');
    });

    it('puts no card up and sends no push, but tells every screen it acted — S-04', async () => {
      await grant();

      await ask();

      expect(harness.broadcaster.frames.map((entry) => entry.kind)).toEqual(['event']);
      expect(harness.broadcaster.last('permission.resolved')).toEqual({
        requestId: 'request-1',
        decision: 'allow',
        auto: true,
        resolvedBy: PERMISSION_OWNER.value,
      });
      // `requested` is what the push listens to: nothing was asked, so nobody is notified.
      expect(harness.events.askedIds).toEqual([]);
      expect(harness.events.requestIds).toEqual(['request-1']);
      expect(harness.scheduler.armed).toBe(0);
    });

    it('refuses by rule with a sentence Claude can work with', async () => {
      await grant({ decision: 'deny' });

      const outcome = await ask();

      expect(outcome).toEqual({
        kind: 'settled',
        resolution: expect.objectContaining({ decision: 'deny', auto: true }),
      });
      expect(outcome.kind === 'settled' && outcome.resolution.reason).toMatch(/rule/);
    });

    it('does not answer a different command, which is still asked — S-05', async () => {
      await grant();

      expect((await ask({ input: { command: 'git push --force' } })).kind).toBe('pending');
    });

    it('never answers another person, who is still asked — S-14', async () => {
      await grant({ scope: 'always', projectPath: null });

      const outcome = await ask({ userId: stranger });

      expect(outcome.kind).toBe('pending');
      expect(harness.events.askedIds).toEqual(['request-1']);
    });

    it('stops answering once expired — S-12', async () => {
      await grant();
      harness.clock.advance(TEST_PERMISSION_SETTINGS.ruleDefaultLifetimeMs);

      expect((await ask()).kind).toBe('pending');
    });

    it('asks a human in `plan`, even with an allow rule standing — S-56', async () => {
      await grant();

      expect((await ask({ permissionMode: 'plan' })).kind).toBe('pending');
    });

    it('asks a human when the rules cannot be read — never allows — S-59', async () => {
      await grant();
      const failure = new Error('database down');
      harness.rules.lookupFailure = failure;

      const outcome = await ask();

      expect(outcome.kind).toBe('pending');
      expect(harness.lookupFailures).toEqual([failure]);
      expect(harness.events.askedIds).toEqual(['request-1']);
    });

    it('answers two requests that arrive together — S-11', async () => {
      await grant();

      const [first, second] = await Promise.all([
        ask({ requestId: 'request-1' }),
        ask({ requestId: 'request-2', sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY2') }),
      ]);

      expect([first.kind, second.kind]).toEqual(['settled', 'settled']);
    });
  });

  describe('revoking', () => {
    it('makes the next request ask again, in a session already running — S-09', async () => {
      const rule = await grant();
      expect((await ask({ requestId: 'request-1' })).kind).toBe('settled');

      await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      expect((await ask({ requestId: 'request-2' })).kind).toBe('pending');
    });

    it('records the grant and the revocation in the trail — S-13', async () => {
      const rule = await grant();
      await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      expect(harness.trail.kinds).toEqual(['permission.ruleGranted', 'permission.ruleRevoked']);
      expect(harness.trail.appended.map((event) => event.subjectId)).toEqual([rule.id, rule.id]);
    });

    it('answers the same, and records once, when revoked twice — S-55', async () => {
      const rule = await grant();

      const first = await harness.revoke.execute(PERMISSION_OWNER, rule.id);
      harness.clock.advance(1_000);
      const second = await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      expect(second.revokedAt).toEqual(first.revokedAt);
      expect(harness.trail.kinds.filter((kind) => kind === 'permission.ruleRevoked')).toHaveLength(
        1,
      );
    });

    it('answers the same to both, and records once, when two clients revoke together — S-46', async () => {
      const rule = await grant();

      const [fromTheWeb, fromThePhone] = await Promise.all([
        harness.revoke.execute(PERMISSION_OWNER, rule.id),
        harness.revoke.execute(PERMISSION_OWNER, rule.id),
      ]);

      expect(fromThePhone).toEqual(fromTheWeb);
      expect(harness.trail.kinds).toEqual(['permission.ruleGranted', 'permission.ruleRevoked']);
    });

    it('answers with the revocation that landed first when another one lands between its read and its write — S-46', async () => {
      const rule = await grant();
      const landedFirst = rule.revoke(harness.clock.now());
      harness.clock.advance(1_000);

      // This call reads the rule while it is still active; the other client's write lands before
      // this one does. Only the store can tell, and the answer has to be the store's.
      const read = harness.rules.findById.bind(harness.rules);
      vi.spyOn(harness.rules, 'findById').mockImplementationOnce(async (ruleId) => {
        const active = await read(ruleId);
        await harness.rules.saveRevocation(landedFirst);
        return active;
      });

      const answered = await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      expect(answered.revokedAt).toEqual(landedFirst.revokedAt);
      expect(harness.trail.kinds).toEqual(['permission.ruleGranted']);
    });

    it('refuses a rule that does not exist — S-54', async () => {
      await expect(harness.revoke.execute(PERMISSION_OWNER, 'no-such-rule')).rejects.toThrow(
        PermissionRuleNotFoundError,
      );
    });

    it('refuses somebody else, and the rule keeps applying to its owner — S-53', async () => {
      const rule = await grant();

      await expect(harness.revoke.execute(stranger, rule.id)).rejects.toThrow(
        PermissionRuleNotOwnedError,
      );
      expect((await ask()).kind).toBe('settled');
      expect(harness.trail.kinds).toEqual(['permission.ruleGranted']);
    });
  });

  describe('granting', () => {
    it('hands back the same rule when granted twice, and records it once — S-10', async () => {
      const first = await grant();
      const second = await grant();

      expect(second.id).toBe(first.id);
      expect(harness.rules.rules).toHaveLength(1);
      expect(harness.trail.kinds).toEqual(['permission.ruleGranted']);
    });

    it('grants a new rule beside an expired equivalent, which stays listed', async () => {
      const first = await grant();
      harness.clock.advance(TEST_PERMISSION_SETTINGS.ruleDefaultLifetimeMs);

      const second = await grant();

      expect(second.id).not.toBe(first.id);
      expect((await harness.list.execute(PERMISSION_OWNER)).map((listed) => listed.status)).toEqual(
        ['active', 'expired'],
      );
    });

    it('takes the configured default when no lifetime is asked for', async () => {
      const rule = await grant();

      expect(rule.expiresAt).toEqual(
        new Date(PERMISSION_NOW.getTime() + TEST_PERMISSION_SETTINGS.ruleDefaultLifetimeMs),
      );
    });

    it('accepts a lifetime exactly at the ceiling — S-49', async () => {
      const expiresAt = new Date(
        PERMISSION_NOW.getTime() + TEST_PERMISSION_SETTINGS.ruleMaxLifetimeMs,
      );

      expect((await grant({ expiresAt })).expiresAt).toEqual(expiresAt);
    });

    it('refuses a lifetime one millisecond past the ceiling — S-49', async () => {
      const expiresAt = new Date(
        PERMISSION_NOW.getTime() + TEST_PERMISSION_SETTINGS.ruleMaxLifetimeMs + 1,
      );

      await expect(grant({ expiresAt })).rejects.toThrow(PermissionRuleExpiryTooLongError);
      expect(harness.rules.rules).toEqual([]);
      expect(harness.trail.kinds).toEqual([]);
    });

    it('refuses a rule that would already be over — S-61', async () => {
      await expect(grant({ expiresAt: PERMISSION_NOW })).rejects.toThrow(
        PermissionRuleExpiryInvalidError,
      );
    });

    it('refuses a pattern outside the grammar — S-47', async () => {
      await expect(grant({ pattern: 'Bash(git *' })).rejects.toThrow(
        PermissionRulePatternInvalidError,
      );
    });

    it('refuses a project rule with no project', async () => {
      await expect(grant({ projectPath: null })).rejects.toThrow(PermissionScopeUnsupportedError);
    });

    it('ignores a project path on an `always` rule rather than storing a contradiction', async () => {
      const rule = await grant({ scope: 'always', projectPath: PERMISSION_PROJECT });

      expect(rule.projectPath).toBeNull();
    });
  });

  describe('listing', () => {
    it('lists the caller`s own rules, marks the expired, and leaves the revoked out', async () => {
      const revoked = await grant({ pattern: 'Bash(ls)' });
      await grant({ pattern: 'Bash(pwd)', expiresAt: new Date(PERMISSION_NOW.getTime() + 1) });
      await grant({ pattern: 'Bash(whoami)' });
      await harness.grant.execute({
        userId: stranger,
        pattern: 'Bash(id)',
        decision: 'allow',
        scope: 'always',
        projectPath: null,
        expiresAt: null,
      });
      await harness.revoke.execute(PERMISSION_OWNER, revoked.id);
      harness.clock.advance(1);

      const listed = await harness.list.execute(PERMISSION_OWNER);

      expect(listed.map(({ rule, status }) => [rule.ruleContent, status])).toEqual([
        ['Bash(whoami)', 'active'],
        ['Bash(pwd)', 'expired'],
      ]);
    });

    it('is empty for somebody with no rule', async () => {
      expect(await harness.list.execute(stranger)).toEqual([]);
    });
  });

  describe('opening one rule', () => {
    it('opens an active rule, with where it stands', async () => {
      const rule = await grant();

      expect(await harness.describeRule.execute(PERMISSION_OWNER, rule.id)).toEqual({
        rule,
        status: 'active',
      });
    });

    it('opens a revoked rule too, saying it was revoked — S-50', async () => {
      // The listing leaves it out on purpose; the trail still points at it.
      const rule = await grant();
      const revoked = await harness.revoke.execute(PERMISSION_OWNER, rule.id);

      const opened = await harness.describeRule.execute(PERMISSION_OWNER, rule.id);

      expect(opened.status).toBe('revoked');
      expect(opened.rule.revokedAt).toEqual(revoked.revokedAt);
    });

    it('opens an expired rule, saying it expired', async () => {
      const rule = await grant({ expiresAt: new Date(PERMISSION_NOW.getTime() + 1) });
      harness.clock.advance(1);

      expect((await harness.describeRule.execute(PERMISSION_OWNER, rule.id)).status).toBe(
        'expired',
      );
    });

    it('refuses a rule that does not exist — S-74', async () => {
      await expect(harness.describeRule.execute(PERMISSION_OWNER, 'no-such-rule')).rejects.toThrow(
        PermissionRuleNotFoundError,
      );
    });

    it('refuses somebody else`s rule — S-74', async () => {
      const rule = await grant();

      await expect(harness.describeRule.execute(stranger, rule.id)).rejects.toThrow(
        PermissionRuleNotOwnedError,
      );
    });
  });
});
