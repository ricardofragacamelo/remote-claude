import { describe, expect, it } from 'vitest';

import { parseRulePattern, ruleBreadth } from '@domain/permission';

const breadthOf = (pattern: string) => ruleBreadth(parseRulePattern(pattern));

/**
 * How far a pattern reaches on its own, by `kind` — plan 15, D-09. Pure over the pattern: `allow`
 * and `deny` read the same table, and it is the use case that grants a rule, not this function,
 * that decides what each width means for each decision.
 */
describe('ruleBreadth', () => {
  it.each([
    'shell',
    'shell(sh:*)',
    'shell(bash -c:*)',
    'shell(env:*)',
    'shell(sudo:*)',
    'shell(xargs:*)',
    'shell(npx:*)',
    'shell(python3:*)',
    'shell(pnpm dlx:*)',
    'mcp',
  ])('reads %j as unbounded — S-15', (pattern) => {
    expect(breadthOf(pattern)).toBe('unbounded');
  });

  it.each([
    'shell(git:*)',
    'file.write',
    'file.edit(src/**)',
    'mcp(srv:tool)',
    'mcp(srv:*)',
    'web.fetch',
    'agent',
  ])('reads %j as broad — S-15', (pattern) => {
    expect(breadthOf(pattern)).toBe('broad');
  });

  it.each(['shell(git status:*)', 'shell(git status)', 'web.fetch(domain:example.com)'])(
    'reads %j as narrow — S-15',
    (pattern) => {
      expect(breadthOf(pattern)).toBe('narrow');
    },
  );

  it('treats a prefix that carries an operator as unbounded, even with one safe-looking token — S-16', () => {
    expect(breadthOf('shell(make &&:*)')).toBe('unbounded');
    expect(breadthOf('shell(git status && rm:*)')).toBe('unbounded');
  });

  it('is not widened by a leading space, a tab, or doubled whitespace in the prefix — S-17', () => {
    expect(breadthOf('shell( git   status\t:*)')).toBe('narrow');
    expect(breadthOf('shell(  sudo :*)')).toBe('unbounded');
    expect(breadthOf('shell(\tgit:*)')).toBe('broad');
  });

  it('reads an interpreter as the first token even with an argument after it', () => {
    expect(breadthOf('shell(sh -c:*)')).toBe('unbounded');
    expect(breadthOf('shell(python3.12:*)')).toBe('unbounded');
  });
});
