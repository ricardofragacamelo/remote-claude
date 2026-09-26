import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import {
  PermissionRule,
  PermissionRuleExpiryInvalidError,
  PermissionRuleExpiryTooLongError,
  PermissionRulePatternInvalidError,
  PermissionScopeUnsupportedError,
} from '@domain/permission';
import type { PermissionRuleDraft, RuleSubject } from '@domain/permission';
import { SessionId } from '@domain/session';
import { SESSION_ID } from '../../../../support/builders/session.builder';

const now = new Date('2026-09-19T12:00:00.000Z');
const owner = UserId.create('auth|owner');
const other = UserId.create('auth|other');
const sessionId = SessionId.create(SESSION_ID);
const otherSession = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY0');
const project = '/srv/projects/app';

const LIFETIME = 60_000;

/** Where most invocations in this file come from. */
const here: RuleSubject = { userId: owner, sessionId, projectPath: project };

function aRule(overrides: Partial<PermissionRuleDraft> & { lifetimeMs?: number } = {}) {
  const { lifetimeMs, ...draft } = overrides;

  return PermissionRule.create(
    {
      id: 'rule-1',
      userId: owner,
      sessionId,
      projectPath: null,
      pattern: 'Bash(git status:*)',
      decision: 'allow',
      scope: 'session',
      createdAt: now,
      expiresAt: new Date(now.getTime() + (lifetimeMs ?? LIFETIME)),
      ...draft,
    },
    LIFETIME,
  );
}

const aProjectRule = (overrides: Partial<PermissionRuleDraft> = {}) =>
  aRule({ scope: 'project', sessionId: null, projectPath: project, ...overrides });

const anAlwaysRule = (overrides: Partial<PermissionRuleDraft> = {}) =>
  aRule({ scope: 'always', sessionId: null, projectPath: null, ...overrides });

describe('PermissionRule', () => {
  describe('creation', () => {
    it('keeps the pattern exactly as written, because that is the grammar of the SDK', () => {
      expect(aRule({ pattern: '  Bash(git status:*) ' }).ruleContent).toBe('Bash(git status:*)');
    });

    it('refuses a pattern outside the grammar at creation, not at the first match — S-47', () => {
      // A malformed pattern kept as a rule would simply never fire, and look exactly like a rule
      // nobody granted.
      expect(() => aRule({ pattern: 'Bash(' })).toThrow(PermissionRulePatternInvalidError);
    });

    it('refuses to outlive the ceiling rather than being truncated in silence', () => {
      expect(() => aRule({ lifetimeMs: LIFETIME + 1 })).toThrow(PermissionRuleExpiryTooLongError);
    });

    it('accepts a lifetime exactly at the ceiling', () => {
      expect(aRule({ lifetimeMs: LIFETIME }).expiresAt.getTime()).toBe(now.getTime() + LIFETIME);
    });

    it.each([0, -1])('refuses to expire %i ms after it was created — S-61', (lifetimeMs) => {
      // A rule already over would sit in the list as expired, claiming an authorisation that
      // could never have been used.
      expect(() => aRule({ lifetimeMs })).toThrow(PermissionRuleExpiryInvalidError);
    });

    it('accepts the shortest lifetime there is — S-61', () => {
      expect(aRule({ lifetimeMs: 1 }).isActiveAt(now)).toBe(true);
    });

    it.each<[string, Partial<PermissionRuleDraft>]>([
      ['a session rule with no session', { scope: 'session', sessionId: null }],
      ['a session rule that also names a project', { scope: 'session', projectPath: project }],
      ['a project rule with no project', { scope: 'project', sessionId: null, projectPath: null }],
      [
        'a project rule with an empty project',
        { scope: 'project', sessionId: null, projectPath: '' },
      ],
      ['a project rule that names a session', { scope: 'project', projectPath: project }],
      [
        'an always rule that names a project',
        { scope: 'always', sessionId: null, projectPath: project },
      ],
      ['an always rule that names a session', { scope: 'always', projectPath: null }],
    ])('refuses %s rather than reading it generously', (_label, draft) => {
      expect(() => aRule(draft)).toThrow(PermissionScopeUnsupportedError);
    });
  });

  describe('matching', () => {
    it('answers an invocation it covers, for the person who granted it', () => {
      expect(aRule().matches(here, 'Bash', { command: 'git status --short' }, now)).toBe(true);
    });

    it('never answers somebody else, however well the pattern fits — S-14', () => {
      // A rule belongs to a person. Otherwise "I trust this command" quietly becomes "anybody on
      // this installation trusts this command".
      for (const rule of [aRule(), aProjectRule(), anAlwaysRule()]) {
        expect(
          rule.matches({ ...here, userId: other }, 'Bash', { command: 'git status' }, now),
        ).toBe(false);
      }
    });

    it('stops answering the instant it expires — S-12', () => {
      const rule = aRule();
      const lastMoment = new Date(now.getTime() + LIFETIME - 1);
      const expiry = new Date(now.getTime() + LIFETIME);

      expect(rule.matches(here, 'Bash', { command: 'git status' }, lastMoment)).toBe(true);
      expect(rule.matches(here, 'Bash', { command: 'git status' }, expiry)).toBe(false);
      expect(rule.statusAt(expiry)).toBe('expired');
    });

    it('does not answer an invocation outside its pattern — S-05', () => {
      expect(aRule().matches(here, 'Bash', { command: 'rm -rf build' }, now)).toBe(false);
    });

    it('keeps a session rule to its own session — S-03', () => {
      expect(
        aRule().matches(
          { ...here, sessionId: otherSession },
          'Bash',
          { command: 'git status' },
          now,
        ),
      ).toBe(false);
    });

    it('reaches every session of the same project — S-01', () => {
      expect(
        aProjectRule().matches(
          { ...here, sessionId: otherSession },
          'Bash',
          { command: 'git status' },
          now,
        ),
      ).toBe(true);
    });

    it('does not reach a session in another project — S-57', () => {
      const elsewhere = { ...here, projectPath: '/srv/projects/other' };

      expect(aProjectRule().matches(elsewhere, 'Bash', { command: 'git status' }, now)).toBe(false);
      // Nor a sibling whose name merely starts the same way.
      expect(
        aProjectRule().matches(
          { ...here, projectPath: `${project}-2` },
          'Bash',
          { command: 'git status' },
          now,
        ),
      ).toBe(false);
    });

    it('does not reach a request whose project could not be told', () => {
      expect(
        aProjectRule().matches(
          { ...here, projectPath: null },
          'Bash',
          { command: 'git status' },
          now,
        ),
      ).toBe(false);
    });

    it('reaches any project, and a request with none, when it is `always` — S-02', () => {
      for (const projectPath of [project, '/srv/projects/other', null]) {
        expect(
          anAlwaysRule().matches({ ...here, projectPath }, 'Bash', { command: 'git status' }, now),
        ).toBe(true);
      }
    });
  });

  describe('revocation', () => {
    it('stops answering at once, and says it was revoked rather than expired', () => {
      const revoked = aProjectRule().revoke(now);

      expect(revoked.statusAt(now)).toBe('revoked');
      expect(revoked.revokedAt).toEqual(now);
      expect(revoked.matches(here, 'Bash', { command: 'git status' }, now)).toBe(false);
    });

    it('is the same rule when revoked twice, which is what makes twice one act — S-55', () => {
      const revoked = aProjectRule().revoke(now);

      expect(revoked.revoke(new Date(now.getTime() + 1))).toBe(revoked);
    });

    it('says revoked even once the rule would have expired anyway', () => {
      const revoked = aProjectRule().revoke(now);

      expect(revoked.statusAt(new Date(now.getTime() + LIFETIME * 2))).toBe('revoked');
    });

    it('leaves the rule it was called on untouched', () => {
      const rule = aProjectRule();
      rule.revoke(now);

      expect(rule.statusAt(now)).toBe('active');
    });
  });

  describe('equivalence', () => {
    it('holds for the same person, scope, place, pattern and decision — S-10', () => {
      expect(aProjectRule().isEquivalentTo(aProjectRule({ id: 'rule-2' }))).toBe(true);
      expect(aRule().isEquivalentTo(aRule({ id: 'rule-2' }))).toBe(true);
    });

    it.each<[string, Partial<PermissionRuleDraft>]>([
      ['another person', { userId: other }],
      ['another project', { projectPath: '/srv/projects/other' }],
      ['another pattern', { pattern: 'Bash(git status)' }],
      ['another decision', { decision: 'deny' }],
    ])('does not hold for %s', (_label, change) => {
      expect(aProjectRule().isEquivalentTo(aProjectRule({ id: 'rule-2', ...change }))).toBe(false);
    });

    it('does not hold across scopes', () => {
      expect(aProjectRule().isEquivalentTo(anAlwaysRule({ id: 'rule-2' }))).toBe(false);
      expect(aRule().isEquivalentTo(aRule({ id: 'rule-2', sessionId: otherSession }))).toBe(false);
    });
  });

  describe('restore', () => {
    it('brings a stored rule back as it was, without asking the ceiling again', () => {
      // A rule granted under last month's ceiling is still the rule somebody granted.
      const stored = {
        ...anAlwaysRule().snapshot(),
        expiresAt: new Date(now.getTime() + LIFETIME * 10),
        revokedAt: null,
      };
      const restored = PermissionRule.restore(stored);

      expect(restored.snapshot()).toEqual(stored);
      expect(restored.pattern).toEqual({ toolName: 'Bash', kind: 'prefix', content: 'git status' });
      expect(restored.isActiveAt(now)).toBe(true);
    });

    it('exposes what the list shows', () => {
      const rule = aProjectRule();

      expect(rule).toMatchObject({
        id: 'rule-1',
        scope: 'project',
        decision: 'allow',
        projectPath: project,
        sessionId: null,
        createdAt: now,
        revokedAt: null,
      });
      expect(rule.userId.equals(owner)).toBe(true);
    });
  });
});
