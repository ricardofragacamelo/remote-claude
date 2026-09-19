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
 * The stored pattern is **literally** what goes back to the SDK in `updatedPermissions`, so a
 * grammar of our own would need translating — and a translation that is one character out makes
 * our half authorise a set of commands the Claude half does not, or the other way round.
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
  ])('refuses %j — %s', (pattern) => {
    expect(() => parseRulePattern(pattern)).toThrow(PermissionRulePatternInvalidError);
  });
});

describe('ruleMatches', () => {
  const pattern = parseRulePattern('Bash(git status:*)');

  it('covers the prefix itself', () => {
    expect(ruleMatches(pattern, 'Bash', { command: 'git status' })).toBe(true);
  });

  it('covers what continues it at a token boundary', () => {
    expect(ruleMatches(pattern, 'Bash', { command: 'git status --short' })).toBe(true);
  });

  it('does not cover a word that merely starts with it', () => {
    // The hole a bare `startsWith` leaves, and the one nobody notices until something is named
    // just so: `git statusx` is a different command.
    expect(ruleMatches(pattern, 'Bash', { command: 'git statusx' })).toBe(false);
  });

  it('does not cover another tool', () => {
    expect(ruleMatches(pattern, 'Write', { command: 'git status' })).toBe(false);
  });

  it('covers every input of a whole-tool pattern', () => {
    expect(ruleMatches(parseRulePattern('Read'), 'Read', { file_path: '/anything' })).toBe(true);
  });

  it('matches an exact pattern only on the exact value', () => {
    const exact = parseRulePattern('Bash(git status)');

    expect(ruleMatches(exact, 'Bash', { command: 'git status' })).toBe(true);
    expect(ruleMatches(exact, 'Bash', { command: 'git status --short' })).toBe(false);
  });

  it('matches nothing when the input carries no field a pattern can name', () => {
    // The conservative reading: an unrecognised shape matches less, never more.
    expect(ruleMatches(pattern, 'Bash', { something: 1 })).toBe(false);
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
