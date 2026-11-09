import { describe, expect, it } from 'vitest';

import { decideOutcome } from '@application/permission';
import { PermissionRule } from '@domain/permission';
import type { PermissionRuleDraft, RuleQuestion } from '@domain/permission';
import type { PermissionMode } from '@domain/engine';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { claudeTool } from '../../../support/builders/tool.builder';
import { SESSION_ID } from '../../../support/builders/session.builder';

const now = new Date('2026-11-06T12:00:00.000Z');
const owner = UserId.create('auth|owner');
const sessionId = SessionId.create(SESSION_ID);

function rule(id: string, overrides: Partial<PermissionRuleDraft> = {}): PermissionRule {
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

function question(mode: PermissionMode, command = 'git status'): RuleQuestion {
  return {
    subject: { userId: owner, sessionId, projectPath: null },
    tool: claudeTool('Bash', { command }),
    permissionMode: mode,
    now,
  };
}

/**
 * The precedence an evaluation and a simulation share — plan 15, D-12. Every branch on its own,
 * since the use cases that call it only ever reach the combinations their own tests happen to ask.
 */
describe('decideOutcome', () => {
  it('lets a matching allow through, with the rule as the reason — ruleAnswers', () => {
    const allow = rule('a');

    expect(decideOutcome([allow], question('ask'), 'ask')).toMatchObject({
      outcome: 'allow',
      answeringRule: allow,
      reasons: ['ruleAnswers'],
    });
  });

  it('lets a matching deny win over an allow — denyWins', () => {
    const allow = rule('a');
    const deny = rule('d', { decision: 'deny' });

    expect(decideOutcome([allow, deny], question('ask'), 'ask')).toMatchObject({
      outcome: 'deny',
      answeringRule: deny,
      reasons: ['denyWins'],
    });
  });

  it('refuses a change outright in read-only mode, before any rule is read — readOnlyMode', () => {
    const allow = rule('a', { pattern: 'file.edit(src/**)' });
    const readOnlyQuestion: RuleQuestion = {
      ...question('readOnly'),
      tool: claudeTool('Write', { file_path: '/srv/projects/app/src/a.ts', content: 'x' }),
    };

    expect(decideOutcome([allow], readOnlyQuestion, 'readOnly')).toMatchObject({
      outcome: 'deny',
      answeringRule: null,
      reasons: ['readOnlyMode'],
    });
  });

  it('never lets an allow answer in read-only mode, even for a kind it does not refuse outright', () => {
    // `shell` is a change kind and is refused before the rules; a read is not, so this is the one
    // path that reaches "no allow answers in readOnly" without ever hitting `refusedByMode` first.
    const allow = rule('a', { pattern: 'file.read' });
    const readQuestion: RuleQuestion = {
      ...question('readOnly'),
      tool: claudeTool('Read', { file_path: '/srv/projects/app/a.ts' }),
    };

    expect(decideOutcome([allow], readQuestion, 'readOnly')).toMatchObject({
      outcome: 'ask',
      answeringRule: null,
      reasons: ['readOnlyMode'],
    });
  });

  it('lets Permitir tudo answer when no rule does — allowAllMode', () => {
    expect(decideOutcome([], question('allowAll'), 'allowAll')).toMatchObject({
      outcome: 'allow',
      answeringRule: null,
      reasons: ['allowAllMode'],
    });
  });

  it('asks when no rule matches and the mode answers nothing on its own — noRule', () => {
    expect(decideOutcome([], question('ask'), 'ask')).toMatchObject({
      outcome: 'ask',
      answeringRule: null,
      reasons: ['noRule'],
    });
  });

  it('lists every matching rule, not only the one that answers', () => {
    const allow = rule('a');
    const deny = rule('d', { decision: 'deny' });

    const { matching } = decideOutcome([allow, deny], question('ask'), 'ask');

    expect(matching).toEqual([allow, deny]);
  });
});
