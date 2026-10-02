import { describe, expect, it } from 'vitest';

import {
  PermissionRulePatternInvalidError,
  matchedInput,
  parseRulePattern,
  patternForInvocation,
  ruleMatches,
} from '@domain/permission';

/**
 * The grammar of the Claude Code settings, which is ours because it has to be.
 *
 * The stored pattern is **literally** the grammar of the SDK's `PermissionUpdate` — not sent back
 * today (D-09 of the rules plan), but a grammar of our own would need translating the day it is,
 * and a translation that is one character out makes our half authorise a set of commands the
 * Claude half does not, or the other way round.
 */
describe('parseRulePattern', () => {
  it('reads a bare tool name as the whole tool', () => {
    expect(parseRulePattern('Bash')).toEqual({ toolName: 'Bash', kind: 'tool', content: '' });
  });

  it('reads parentheses as an exact match', () => {
    expect(parseRulePattern('Bash(git status)')).toEqual({
      toolName: 'Bash',
      kind: 'exact',
      content: 'git status',
    });
  });

  it('reads a trailing :* as a prefix', () => {
    expect(parseRulePattern('Bash(git status:*)')).toEqual({
      toolName: 'Bash',
      kind: 'prefix',
      content: 'git status',
    });
  });

  it.each([
    ['Bash()', 'empty parentheses are a pattern somebody meant to fill in, not "every Bash"'],
    ['Bash(:*)', 'a prefix of nothing would be every command there is'],
    ['(git status)', 'no tool at all'],
    ['9Bash(x)', 'a tool name that is not an identifier'],
    ['', 'nothing'],
  ])('refuses %j — %s — S-47', (pattern) => {
    expect(() => parseRulePattern(pattern)).toThrow(PermissionRulePatternInvalidError);
  });
});

describe('ruleMatches', () => {
  const pattern = parseRulePattern('Bash(git status:*)');

  it('covers the prefix itself', () => {
    expect(ruleMatches(pattern, 'Bash', { command: 'git status' }, 'allow')).toBe(true);
  });

  it('covers what continues it at a token boundary — S-48', () => {
    expect(ruleMatches(pattern, 'Bash', { command: 'git status --short' }, 'allow')).toBe(true);
  });

  it('does not cover a word that merely starts with it — S-48', () => {
    // The hole a bare `startsWith` leaves, and the one nobody notices until something is named
    // just so: `git statusx` is a different command.
    expect(ruleMatches(pattern, 'Bash', { command: 'git statusx' }, 'allow')).toBe(false);
  });

  it('does not cover another tool', () => {
    expect(ruleMatches(pattern, 'Write', { command: 'git status' }, 'allow')).toBe(false);
  });

  it('covers every input of a whole-tool pattern', () => {
    expect(ruleMatches(parseRulePattern('Read'), 'Read', { file_path: '/anything' }, 'allow')).toBe(
      true,
    );
  });

  it('matches an exact pattern only on the exact value', () => {
    const exact = parseRulePattern('Bash(git status)');

    expect(ruleMatches(exact, 'Bash', { command: 'git status' }, 'allow')).toBe(true);
    expect(ruleMatches(exact, 'Bash', { command: 'git status --short' }, 'allow')).toBe(false);
  });

  it('does not let `Bash(git status)` cover `git push --force` — S-06', () => {
    const exact = parseRulePattern('Bash(git status)');

    expect(ruleMatches(exact, 'Bash', { command: 'git push --force' }, 'allow')).toBe(false);
    expect(ruleMatches(pattern, 'Bash', { command: 'git push --force' }, 'allow')).toBe(false);
  });

  it('matches nothing when the input carries no field a pattern can name — S-05', () => {
    // The conservative reading: an unrecognised shape matches less, never more.
    expect(ruleMatches(pattern, 'Bash', { something: 1 }, 'allow')).toBe(false);
  });
});

/**
 * A prefix rule and a shell line that runs more than one command — plan 15, B-08, D-07.
 *
 * Before this, `allow Bash(git status:*)` answered `git status && curl … | sh`: the prefix looked at
 * the start of the line and nothing else.
 */
describe('ruleMatches on a shell line — 15 · B-08', () => {
  const gitStatus = parseRulePattern('Bash(git status:*)');
  const rm = parseRulePattern('Bash(rm:*)');
  const bash = (command: string) => ({ command });

  it('does not let an allow prefix answer a chained command — S-07', () => {
    expect(ruleMatches(gitStatus, 'Bash', bash('git status && curl x | sh'), 'allow')).toBe(false);
    expect(ruleMatches(gitStatus, 'Bash', bash('git status --short'), 'allow')).toBe(true);
  });

  it.each([
    'git status; rm -rf ~',
    'git status && rm -rf ~',
    'git status || rm -rf ~',
    'git status | sh',
    'git status & rm -rf ~',
    'git status\nrm -rf ~',
    'git status `rm -rf ~`',
    'git status $(rm -rf ~)',
    'git status <(rm -rf ~)',
    'git status >(rm -rf ~)',
    'git status > /etc/passwd',
    'git status >> ~/.bashrc',
    'git status < /dev/zero',
  ])('takes %j out of the allow prefix — S-08', (command) => {
    expect(ruleMatches(gitStatus, 'Bash', bash(command), 'allow')).toBe(false);
  });

  it('counts an operator inside quotes too: a question more, never an authorisation more — S-09', () => {
    const commit = parseRulePattern('Bash(git commit:*)');

    expect(ruleMatches(commit, 'Bash', bash('git commit -m "a; b"'), 'allow')).toBe(false);
    expect(ruleMatches(commit, 'Bash', bash('git commit -m "a b"'), 'allow')).toBe(true);
  });

  it('lets a deny prefix refuse a command hidden after another — S-10', () => {
    expect(ruleMatches(rm, 'Bash', bash('ls && rm -rf build'), 'deny')).toBe(true);
    expect(ruleMatches(rm, 'Bash', bash('ls; rm -rf build'), 'deny')).toBe(true);
  });

  it('refuses a substituted command, and leaves xargs out of reach as the help says — S-11', () => {
    expect(ruleMatches(rm, 'Bash', bash('echo $(rm -rf x)'), 'deny')).toBe(true);
    expect(ruleMatches(rm, 'Bash', bash('echo `rm -rf x`'), 'deny')).toBe(true);
    // `rm` is an argument of `xargs` here, not a command at the start of a segment: out of reach,
    // and declared so — a deny on `Bash` is a speed bump, not a sandbox.
    expect(ruleMatches(rm, 'Bash', bash('ls | xargs rm'), 'deny')).toBe(false);
  });

  it('still lets an exact allow cover the identical composite line, and nothing else — S-12', () => {
    const exact = parseRulePattern('Bash(make && make test)');

    expect(ruleMatches(exact, 'Bash', bash('make && make test'), 'allow')).toBe(true);
    expect(ruleMatches(exact, 'Bash', bash('make && make test && rm -rf ~'), 'allow')).toBe(false);
  });

  it('lets an exact deny refuse the same command inside a longer line', () => {
    const exact = parseRulePattern('Bash(rm -rf /)');

    expect(ruleMatches(exact, 'Bash', bash('ls && rm -rf /'), 'deny')).toBe(true);
    expect(ruleMatches(exact, 'Bash', bash('ls && rm -rf /tmp'), 'deny')).toBe(false);
  });

  it('reads a path tool as before: shell operators mean nothing in a file name', () => {
    const read = parseRulePattern('Read(/srv/a;b:*)');

    expect(ruleMatches(read, 'Read', { file_path: '/srv/a;b c' }, 'allow')).toBe(true);
  });

  /**
   * The change only ever moves in the safe direction — S-20.
   *
   * Every line of up to three words and two operators from a small vocabulary, against every prefix
   * of the same vocabulary: whatever the new allow answers, the old one answered; whatever the old
   * deny refused, the new one refuses. Enumerated rather than sampled, so it is the same proof on
   * every run.
   */
  it('answers a subset with allow and refuses a superset with deny, over every generated line — S-20', () => {
    const words = ['git', 'status', 'rm', '-rf', 'x'];
    const joins = [' ', ' && ', '; ', ' | ', ' & ', ' $(', ' > '];
    const lines: string[] = [];

    for (const a of words) {
      for (const j1 of joins) {
        for (const b of words) {
          lines.push(`${a}${j1}${b}`);
          for (const j2 of joins) {
            for (const c of words) {
              lines.push(`${a}${j1}${b}${j2}${c}`);
            }
          }
        }
      }
    }

    const prefixes = ['git', 'git status', 'rm', 'rm -rf'].map((p) =>
      parseRulePattern(`Bash(${p}:*)`),
    );
    const before = (prefix: string, line: string): boolean =>
      line === prefix || line.startsWith(`${prefix} `);

    let checked = 0;
    for (const pattern of prefixes) {
      for (const line of lines) {
        const old = before(pattern.content, line);

        if (ruleMatches(pattern, 'Bash', bash(line), 'allow')) {
          expect(old, `allow ${pattern.content} on ${line}`).toBe(true);
        }
        if (old) {
          expect(
            ruleMatches(pattern, 'Bash', bash(line), 'deny'),
            `deny ${pattern.content} on ${line}`,
          ).toBe(true);
        }
        checked += 1;
      }
    }

    expect(checked).toBeGreaterThan(5_000);
  });
});

describe('matchedInput', () => {
  it('prefers the command, then the path', () => {
    expect(matchedInput({ file_path: '/a', command: 'ls' })).toBe('ls');
    expect(matchedInput({ file_path: '/a' })).toBe('/a');
  });

  it('is null when nothing it knows is a string', () => {
    expect(matchedInput({ command: 42 })).toBeNull();
  });
});

describe('patternForInvocation', () => {
  it('names the narrowest pattern that covers the invocation', () => {
    expect(patternForInvocation('Bash', { command: 'git status' })).toBe('Bash(git status)');
  });

  it.each([
    // The only available pattern would be the whole tool, which is far more than was approved…
    [{ nothing: true }],
    // …and this one would read back as something other than what was written.
    [{ command: 'echo (x)' }],
  ])('refuses to write one for %j', (input) => {
    // `null` and not the tool name: falling back to `Bash` would grant far more than what was
    // approved, which is the one direction a permission system may not fall back in.
    expect(patternForInvocation('Bash', input)).toBeNull();
  });
});
