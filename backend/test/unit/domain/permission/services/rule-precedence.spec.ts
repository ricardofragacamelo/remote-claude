import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { PermissionRule, answeringRule } from '@domain/permission';
import type { PermissionRuleDraft, RuleQuestion } from '@domain/permission';
import type { PermissionMode } from '@domain/session';
import { SessionId } from '@domain/session';
import { SESSION_ID } from '../../../../support/builders/session.builder';

const now = new Date('2026-09-19T12:00:00.000Z');
const owner = UserId.create('auth|owner');
const sessionId = SessionId.create(SESSION_ID);
const project = '/srv/projects/app';

function rule(id: string, overrides: Partial<PermissionRuleDraft>): PermissionRule {
  return PermissionRule.create(
    {
      id,
      userId: owner,
      sessionId: null,
      projectPath: null,
      pattern: 'Bash(git status:*)',
      decision: 'allow',
      scope: 'always',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      ...overrides,
    },
    60_000,
  );
}

function question(
  permissionMode: PermissionMode = 'default',
  command = 'git status',
): RuleQuestion {
  return {
    subject: { userId: owner, sessionId, projectPath: project },
    toolName: 'Bash',
    input: { command },
    permissionMode,
    now,
  };
}

const allowAlways = rule('allow-always', {});
const denyProject = rule('deny-project', {
  scope: 'project',
  projectPath: project,
  decision: 'deny',
});
const denySession = rule('deny-session', { scope: 'session', sessionId, decision: 'deny' });
const allowSession = rule('allow-session', { scope: 'session', sessionId });

describe('answeringRule', () => {
  it('lets a matching allow answer when nothing refuses', () => {
    expect(answeringRule([allowAlways], question())).toBe(allowAlways);
  });

  it('answers nothing when no rule matches — the human is asked — S-05', () => {
    expect(answeringRule([allowAlways], question('default', 'git push --force'))).toBeNull();
    expect(answeringRule([], question())).toBeNull();
  });

  it('lets deny beat allow in the same scope — S-07', () => {
    const denyAlways = rule('deny-always', { decision: 'deny' });

    expect(answeringRule([allowAlways, denyAlways], question())).toBe(denyAlways);
  });

  it('lets deny beat allow across scopes, whichever is wider — S-07', () => {
    // A narrower deny beside a wider allow, and a wider deny beside a narrower allow: refusing is
    // the more restrictive answer both times.
    expect(answeringRule([allowAlways, denyProject], question())).toBe(denyProject);
    expect(answeringRule([allowSession, denyProject], question())).toBe(denyProject);
    expect(answeringRule([denySession, allowAlways], question())).toBe(denySession);
  });

  it('ignores a deny that does not match, and lets the allow answer', () => {
    const denyOther = rule('deny-other', { pattern: 'Bash(rm:*)', decision: 'deny' });

    expect(answeringRule([denyOther, allowAlways], question())).toBe(allowAlways);
  });

  it('never auto-approves in `plan`, and still refuses there — S-56', () => {
    // Whoever put the session into planning did not ask for an old rule to execute for them.
    expect(answeringRule([allowAlways, allowSession], question('plan'))).toBeNull();
    expect(answeringRule([allowAlways, denyProject], question('plan'))).toBe(denyProject);
  });

  it.each<PermissionMode>(['default', 'acceptEdits', 'bypassPermissions'])(
    'lets an allow answer in `%s`, where the question reached us at all',
    (mode) => {
      expect(answeringRule([allowAlways], question(mode))).toBe(allowAlways);
    },
  );
});
