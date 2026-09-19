import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import {
  PermissionRule,
  PermissionRuleExpiryTooLongError,
  PermissionRulePatternInvalidError,
} from '@domain/permission';
import { SessionId } from '@domain/session';
import { SESSION_ID } from '../../../../support/builders/session.builder';

const now = new Date('2026-09-19T12:00:00.000Z');
const owner = UserId.create('auth|owner');
const other = UserId.create('auth|other');
const sessionId = SessionId.create(SESSION_ID);

const LIFETIME = 60_000;

function aRule(overrides: { pattern?: string; userId?: UserId; lifetimeMs?: number } = {}) {
  return PermissionRule.create(
    {
      id: 'rule-1',
      userId: overrides.userId ?? owner,
      sessionId,
      pattern: overrides.pattern ?? 'Bash(git status:*)',
      decision: 'allow',
      scope: 'session',
      createdAt: now,
      expiresAt: new Date(now.getTime() + (overrides.lifetimeMs ?? LIFETIME)),
    },
    LIFETIME,
  );
}

describe('PermissionRule', () => {
  it('keeps the pattern exactly as written, because that is what goes back to the SDK', () => {
    expect(aRule().ruleContent).toBe('Bash(git status:*)');
  });

  it('refuses a pattern outside the grammar at creation, not at the first match', () => {
    // A malformed pattern kept as a rule would simply never fire, and look exactly like a rule
    // nobody granted.
    expect(() => aRule({ pattern: 'Bash(' })).toThrow(PermissionRulePatternInvalidError);
  });

  it('refuses to outlive the ceiling rather than being truncated in silence', () => {
    expect(() => aRule({ lifetimeMs: LIFETIME + 1 })).toThrow(PermissionRuleExpiryTooLongError);
  });

  it('answers an invocation it covers, for the person who granted it — S-60', () => {
    expect(aRule().matches(owner, 'Bash', { command: 'git status --short' }, now)).toBe(true);
  });

  it('never answers somebody else, however well the pattern fits', () => {
    // A rule belongs to a person. Otherwise "I trust this command" quietly becomes "anybody on
    // this installation trusts this command".
    expect(aRule().matches(other, 'Bash', { command: 'git status' }, now)).toBe(false);
  });

  it('stops answering once it has expired', () => {
    const rule = aRule();
    const later = new Date(now.getTime() + LIFETIME);

    expect(rule.isActiveAt(later)).toBe(false);
    expect(rule.matches(owner, 'Bash', { command: 'git status' }, later)).toBe(false);
  });

  it('does not answer an invocation outside its pattern', () => {
    expect(aRule().matches(owner, 'Bash', { command: 'rm -rf build' }, now)).toBe(false);
  });
});
