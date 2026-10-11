import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { PermissionRule, answeredByRule, answeringRule } from '@domain/permission';
import type { PermissionRuleDraft, RuleQuestion } from '@domain/permission';
import type { PermissionMode } from '@domain/session';
import { SessionId } from '@domain/session';
import { SESSION_ID } from '../../../../support/builders/session.builder';
import { canonicalTool, claudeTool } from '../../../../support/builders/tool.builder';

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
      pattern: 'shell(git status:*)',
      decision: 'allow',
      scope: 'always',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      ...overrides,
    },
    60_000,
  );
}

function question(permissionMode: PermissionMode = 'ask', command = 'git status'): RuleQuestion {
  return {
    subject: { userId: owner, sessionId, projectPath: project },
    tool: claudeTool('Bash', { command }, project),
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
    expect(answeringRule([allowAlways], question('ask', 'git push --force'))).toBeNull();
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
    const denyOther = rule('deny-other', { pattern: 'shell(rm:*)', decision: 'deny' });

    expect(answeringRule([denyOther, allowAlways], question())).toBe(allowAlways);
  });

  it('never auto-approves in `readOnly`, and still refuses there — S-56', () => {
    // Whoever put the session into planning did not ask for an old rule to execute for them.
    expect(answeringRule([allowAlways, allowSession], question('readOnly'))).toBeNull();
    expect(answeringRule([allowAlways, denyProject], question('readOnly'))).toBe(denyProject);
  });

  it.each<PermissionMode>(['ask', 'acceptEdits', 'allowAll'])(
    'lets an allow answer in `%s`, where the question reached us at all',
    (mode) => {
      expect(answeringRule([allowAlways], question(mode))).toBe(allowAlways);
    },
  );
});

/**
 * A call that asks the person is never answered by a rule — a question nobody answered, or a plan
 * nobody read (plan 24, D-08). With the canonical grammar no rule can even name one (plan 28, B-32):
 * `question` and `plan` are not rule kinds, so no rule matches them, whatever it allows or refuses.
 */
describe('rules and the calls that ask the person — plan 24, B-07; plan 28, B-32', () => {
  const asking = (toolName: string): RuleQuestion => ({
    subject: { userId: owner, sessionId, projectPath: project },
    tool: claudeTool(
      toolName,
      toolName === 'ExitPlanMode' ? { plan: '# plan' } : { questions: [] },
      project,
    ),
    permissionMode: 'ask',
    now,
  });
  const everything = ['shell(git status:*)', 'file.edit', 'web.search', 'agent', 'mcp(a:*)'];
  const allows = everything.map((pattern) => rule(`allow-${pattern}`, { pattern }));
  const denies = everything.map((pattern) =>
    rule(`deny-${pattern}`, { pattern, decision: 'deny' }),
  );

  it.each(['AskUserQuestion', 'ExitPlanMode'])(
    'answers %s by no rule — S-29, S-32, S-95',
    (toolName) => {
      expect(answeringRule([...allows, ...denies], asking(toolName))).toBeNull();
    },
  );

  it('lets a deny answer anything, and an allow anything but a kind that asks — S-64', () => {
    expect(answeredByRule('deny', 'question')).toBe(true);
    expect(answeredByRule('allow', 'question')).toBe(false);
    expect(answeredByRule('allow', 'plan')).toBe(false);
    expect(answeredByRule('allow', 'shell')).toBe(true);
  });

  it('goes by the kind, never by the name: a question of another engine is one — S-64', () => {
    const of = (kind: string): RuleQuestion => ({
      subject: { userId: owner, sessionId, projectPath: project },
      tool: canonicalTool(kind, {}, 'test-engine'),
      permissionMode: 'ask',
      now,
    });
    const agent = rule('allow-agent', { pattern: 'agent' });

    expect(answeringRule([agent], of('question'))).toBeNull();
    expect(answeringRule([agent], of('plan'))).toBeNull();
    expect(answeringRule([agent], of('agent'))).toBe(agent);
  });
});

/**
 * The precedence of `readOnly` is the one `plan` had (plan 28, B-32, S-96): the mode is read by its
 * canonical name, and no allow answers in it while a deny still refuses.
 */
describe('the precedence in readOnly — S-96', () => {
  it.each<[PermissionMode, string | null]>([
    ['readOnly', null],
    ['ask', 'allow-always'],
  ])('in %s, an allow answers %s', (mode, answering) => {
    expect(answeringRule([allowAlways], question(mode))?.id ?? null).toBe(answering);
  });

  it('refuses by a deny in readOnly, as in plan', () => {
    expect(answeringRule([denyProject, allowAlways], question('readOnly'))).toBe(denyProject);
  });
});

/**
 * A rule restricted to an engine answers that engine's calls only; one with no engine answers every
 * engine whose call has the kind (plan 28, B-33, S-94).
 */
describe('a rule and the engine — S-94', () => {
  const shellOf = (engine: string): RuleQuestion => ({
    ...question(),
    tool: canonicalTool('shell', { command: 'git status' }, engine),
  });

  it('lets a canonical rule answer the shell of any engine', () => {
    expect(answeringRule([allowAlways], shellOf('claude'))).toBe(allowAlways);
    expect(answeringRule([allowAlways], shellOf('test-engine'))).toBe(allowAlways);
  });

  it('lets a rule restricted to an engine answer only that one', () => {
    const onlyClaude = rule('only-claude', { engine: 'claude' });

    expect(answeringRule([onlyClaude], shellOf('claude'))).toBe(onlyClaude);
    expect(answeringRule([onlyClaude], shellOf('test-engine'))).toBeNull();
  });
});
