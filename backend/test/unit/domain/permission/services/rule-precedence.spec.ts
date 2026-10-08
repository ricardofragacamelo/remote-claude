import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { PermissionRule, answeredByRule, answeringRule, ignoredAllow } from '@domain/permission';
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

/**
 * A tool that asks the person is never answered by an `allow` — a question nobody answered, or a
 * plan nobody read (plan 24, D-08). A `deny` still refuses.
 */
describe('rules and the tools that ask the person — plan 24, B-07', () => {
  const asking = (toolName: string): RuleQuestion => ({
    subject: { userId: owner, sessionId, projectPath: project },
    toolName,
    input: toolName === 'ExitPlanMode' ? { plan: '# plan' } : { questions: [] },
    permissionMode: 'default',
    now,
  });

  it.each(['AskUserQuestion', 'ExitPlanMode'])(
    'reads no allow as an answer to %s, and says which one it ignored — S-29, S-32',
    (toolName) => {
      const allow = rule(`allow-${toolName}`, { pattern: toolName });

      expect(answeringRule([allow], asking(toolName))).toBeNull();
      expect(ignoredAllow([allow], asking(toolName))).toBe(allow);
    },
  );

  it.each(['AskUserQuestion', 'ExitPlanMode'])(
    'lets a deny refuse %s by itself — S-30',
    (toolName) => {
      const allow = rule(`allow-${toolName}`, { pattern: toolName });
      const deny = rule(`deny-${toolName}`, { pattern: toolName, decision: 'deny' });

      expect(answeringRule([allow, deny], asking(toolName))).toBe(deny);
    },
  );

  it('ignores nothing for a tool that asks leave, and nothing that does not match', () => {
    expect(ignoredAllow([allowAlways], question())).toBeNull();
    expect(
      ignoredAllow([rule('other', { pattern: 'Bash' })], asking('AskUserQuestion')),
    ).toBeNull();
    expect(
      ignoredAllow(
        [rule('deny', { pattern: 'AskUserQuestion', decision: 'deny' })],
        asking('AskUserQuestion'),
      ),
    ).toBeNull();
  });

  it('lets a deny answer anything, and an allow anything but a tool that asks', () => {
    expect(answeredByRule('deny', 'AskUserQuestion')).toBe(true);
    expect(answeredByRule('allow', 'AskUserQuestion')).toBe(false);
    expect(answeredByRule('allow', 'ExitPlanMode')).toBe(false);
    expect(answeredByRule('allow', 'Bash')).toBe(true);
  });
});
