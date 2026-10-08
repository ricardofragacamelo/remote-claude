import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { PermissionRule, answeringRule, commandsOf } from '@domain/permission';
import type { PermissionRuleDraft, RuleQuestion } from '@domain/permission';
import type { PermissionMode } from '@domain/session';
import { SessionId } from '@domain/session';
import { SESSION_ID } from '../../../../support/builders/session.builder';

const now = new Date('2026-09-19T12:00:00.000Z');
const owner = UserId.create('auth|owner');
const sessionId = SessionId.create(SESSION_ID);
const project = '/srv/projects/app';

function rule(id: string, pattern: string, overrides: Partial<PermissionRuleDraft> = {}) {
  return PermissionRule.create(
    {
      id,
      userId: owner,
      sessionId: null,
      projectPath: null,
      pattern,
      decision: 'allow',
      scope: 'always',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      ...overrides,
    },
    60_000,
  );
}

function asking(command: string, permissionMode: PermissionMode = 'default'): RuleQuestion {
  return {
    subject: { userId: owner, sessionId, projectPath: project },
    toolName: 'Bash',
    input: { command },
    permissionMode,
    now,
  };
}

const push = rule('push', 'Bash(git push:*)');
const tail = rule('tail', 'Bash(tail:*)');
const cd = rule('cd', 'Bash(cd:*)');
const pnpmTest = rule('pnpm-test', 'Bash(pnpm test:*)');
const commit = rule('commit', 'Bash(git commit:*)');
const echo = rule('echo', 'Bash(echo:*)');
const ls = rule('ls', 'Bash(ls:*)');
const status = rule('status', 'Bash(git status:*)');

/**
 * The commands of a line, for the side that allows — plan 23, D-07.
 *
 * Every case is one of the two ways this can go wrong: a command the shell runs that was not read
 * as one (an authorisation more), or a line given up on that could have been read (a question
 * more). Only the second is acceptable, so every doubt gives up.
 */
describe('commandsOf', () => {
  it.each([
    ['git push 2>&1 | tail -5', ['git push', 'tail -5']],
    ['cd /x && pnpm test', ['cd /x', 'pnpm test']],
    ['a; b || c & d', ['a', 'b', 'c', 'd']],
    ['git status', ['git status']],
    ['  git status  ', ['git status']],
  ])('reads %s as its commands — S-31, S-32', (line, commands) => {
    expect(commandsOf(line)).toEqual(commands);
  });

  it.each([
    ['ls 2>&1', 'ls'],
    ['ls 1>&2', 'ls'],
    ['ls >&2', 'ls'],
    ['ls >/dev/null', 'ls'],
    ['ls 2>/dev/null', 'ls'],
    ['ls 2> /dev/null', 'ls'],
    ['ls &>/dev/null', 'ls'],
  ])('takes out %s, which changes nothing about what runs — S-34', (line, command) => {
    expect(commandsOf(line)).toEqual([command]);
  });

  it.each([
    'ls > out.txt',
    'ls >> log',
    'cat < in.txt',
    'ls 2>err.log',
    'ls > /dev/null/../x',
    'ls >/dev/nullx',
  ])('gives up on %s, which redirects for real — S-35', (line) => {
    expect(commandsOf(line)).toBeNull();
  });

  it.each([
    'echo $(rm -rf x)',
    'echo `id`',
    'diff <(ls a) <(ls b)',
    'cat <<EOF\nx\nEOF',
    'ls \\\n&& rm x',
  ])('gives up on %s, which substitutes — S-36', (line) => {
    expect(commandsOf(line)).toBeNull();
  });

  it('gives up when a cut falls inside a quoted text — S-37', () => {
    expect(commandsOf('git commit -m "a && b"')).toBeNull();
    expect(commandsOf("echo 'a | b'")).toBeNull();
  });

  it('gives up on a backslash in a line of several commands — S-38', () => {
    expect(commandsOf('echo a\\ b && ls')).toBeNull();
  });

  it('keeps quotes that close, and a backslash in a line of one command', () => {
    expect(commandsOf('git commit -m "msg" && git push')).toEqual([
      'git commit -m "msg"',
      'git push',
    ]);
    expect(commandsOf('echo a\\ b')).toEqual(['echo a\\ b']);
  });

  it('gives up on a line with no command in it', () => {
    expect(commandsOf(' && ; ')).toBeNull();
  });
});

describe('answeringRule — a line of several commands', () => {
  it('allows when every command is allowed — S-31', () => {
    expect(answeringRule([push, tail], asking('git push 2>&1 | tail -5'))).toBe(push);
  });

  it('allows `cd` and a command after it — S-32', () => {
    expect(answeringRule([cd, pnpmTest], asking('cd /x && pnpm test'))).toBe(cd);
  });

  it('asks when one command has no rule — S-33', () => {
    expect(answeringRule([push], asking('git push && curl x'))).toBeNull();
  });

  it('allows a redirection that changes nothing on a line of one command — S-34', () => {
    expect(answeringRule([push], asking('git push 2>&1'))).toBe(push);
  });

  it('asks about a redirection that writes — S-35', () => {
    expect(answeringRule([ls], asking('ls > out.txt'))).toBeNull();
  });

  it('asks about a substitution, every command covered or not — S-36', () => {
    expect(answeringRule([echo, rule('rm', 'Bash(rm:*)')], asking('echo $(rm -rf x)'))).toBeNull();
  });

  it('asks when a quote does not close in a piece — S-37', () => {
    expect(
      answeringRule([commit, rule('b', 'Bash(b:*)')], asking('git commit -m "a && b"')),
    ).toBeNull();
  });

  it('asks about a backslash in a line of several commands — S-38', () => {
    expect(answeringRule([echo, ls], asking('echo a\\ b && ls'))).toBeNull();
  });

  it('allows quotes that close — S-39', () => {
    expect(answeringRule([commit, push], asking('git commit -m "msg" && git push'))).toBe(commit);
  });

  it('lets an exact rule cover the identical line, and an identical piece — S-40', () => {
    const whole = rule('whole', 'Bash(git push 2>&1 | tail -5)');
    const piece = rule('piece', 'Bash(pnpm test)');

    expect(answeringRule([whole], asking('git push 2>&1 | tail -5'))).toBe(whole);
    expect(answeringRule([piece, cd], asking('cd /x && pnpm test'))).toBe(cd);
    expect(answeringRule([piece, cd], asking('cd /x && pnpm test --watch'))).toBeNull();
  });

  it('respects the token boundary in each piece — S-41', () => {
    expect(answeringRule([status, ls], asking('git statusx && ls'))).toBeNull();
  });

  it('lets a deny on any piece beat the allows of the others — S-42', () => {
    const denyRm = rule('deny-rm', 'Bash(rm:*)', { decision: 'deny' });

    expect(answeringRule([ls, rule('rm', 'Bash(rm:*)'), denyRm], asking('ls && rm -rf x'))).toBe(
      denyRm,
    );
  });

  it('asks in `plan`, every command covered — S-43', () => {
    expect(answeringRule([push, tail], asking('git push 2>&1 | tail -5', 'plan'))).toBeNull();
  });

  it('combines scopes, and answers with the first command`s rule — S-44, D-11', () => {
    const sessionTail = rule('session-tail', 'Bash(tail:*)', { scope: 'session', sessionId });
    const projectPush = rule('project-push', 'Bash(git push:*)', {
      scope: 'project',
      projectPath: project,
    });

    expect(answeringRule([sessionTail, projectPush], asking('git push | tail -5'))).toBe(
      projectPush,
    );
  });

  it('never reads a deny as covering a piece for the allow side', () => {
    const denyTail = rule('deny-tail', 'Bash(tail:*)', { decision: 'deny' });

    expect(answeringRule([push, denyTail], asking('git push | tail -5'))).toBe(denyTail);
  });

  it('reads only shell tools that way', () => {
    // `a && b` is a file name to `Edit`, never two commands: each piece having a rule says nothing.
    const question: RuleQuestion = {
      ...asking('a && b'),
      toolName: 'Edit',
      input: { file_path: 'a && b' },
    };

    expect(answeringRule([rule('a', 'Edit(a)'), rule('b', 'Edit(b)')], question)).toBeNull();
  });
});
