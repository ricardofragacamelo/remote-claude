import { describe, expect, it } from 'vitest';

import {
  PermissionRulePatternInvalidError,
  PermissionRuleToolInteractiveError,
  RULE_KINDS,
  hostOf,
  isRuleKind,
  parseRulePattern,
  patternForInvocation,
  readRulePattern,
  ruleMatches,
} from '@domain/permission';
import type { RulePattern } from '@domain/permission';
import { canonicalTool, claudeTool } from '../../../../support/builders/tool.builder';

const folder = '/srv/projects/app';
const shell = (command: string) => canonicalTool('shell', { command });
const file = (kind: string, path: string) => canonicalTool(kind, { paths: [path] });
const allows = (pattern: string, tool: ReturnType<typeof canonicalTool>, at = folder) =>
  ruleMatches(parseRulePattern(pattern), tool, 'allow', at);

/**
 * The canonical grammar of a rule — plan 28, B-31, D-11. A rule is written by kind, and the domain
 * reads it knowing no engine.
 */
describe('parseRulePattern', () => {
  it.each<[string, RulePattern]>([
    ['shell(git status)', { kind: 'shell', reach: 'exact', content: 'git status' }],
    ['shell(git status:*)', { kind: 'shell', reach: 'prefix', content: 'git status' }],
    ['shell', { kind: 'shell', reach: 'tool', content: '' }],
    ['file.edit(src/**)', { kind: 'file.edit', reach: 'glob', content: 'src/**' }],
    ['file.read(/etc/hosts)', { kind: 'file.read', reach: 'exact', content: '/etc/hosts' }],
    ['file.write(a.ts)', { kind: 'file.write', reach: 'exact', content: 'a.ts' }],
    ['file.delete(tmp/*)', { kind: 'file.delete', reach: 'glob', content: 'tmp/*' }],
    ['file.move', { kind: 'file.move', reach: 'tool', content: '' }],
    ['search(src)', { kind: 'search', reach: 'exact', content: 'src' }],
    [
      'web.fetch(domain:Example.COM)',
      { kind: 'web.fetch', reach: 'exact', content: 'example.com' },
    ],
    ['web.search', { kind: 'web.search', reach: 'tool', content: '' }],
    ['mcp(github:create_issue)', { kind: 'mcp', reach: 'exact', content: 'github:create_issue' }],
    ['mcp(github:*)', { kind: 'mcp', reach: 'prefix', content: 'github' }],
    ['agent', { kind: 'agent', reach: 'tool', content: '' }],
    ['  shell(ls)  ', { kind: 'shell', reach: 'exact', content: 'ls' }],
  ])('reads %j — S-92', (pattern, read) => {
    expect(parseRulePattern(pattern)).toEqual(read);
  });

  it.each([
    ['Bash(git status:*)', 'syntax', "the engine's own grammar is not the canonical one"],
    ['Bash', 'syntax', 'an engine name is not a kind'],
    ['mcp__github__create_issue', 'syntax', "an engine's name of an MCP tool"],
    ['', 'syntax', 'nothing'],
    ['(git status)', 'syntax', 'no kind at all'],
    ['file.', 'syntax', 'a kind cut short'],
    ['shell(x', 'syntax', 'a parenthesis left open'],
    ['tasks', 'unknownKind', 'a kind that takes no rule'],
    ['other(x)', 'unknownKind', 'the generic line takes no rule'],
    ['shell.output', 'unknownKind', "a command's output takes no rule"],
    ['file.copy(a)', 'unknownKind', 'a kind the core does not know'],
    ['shell()', 'emptyMatcher', 'empty parentheses are a pattern somebody meant to fill in'],
    ['shell(echo (x))', 'parenthesis', 'a `)` inside would read back as something else'],
    ['shell(:*)', 'emptyPrefix', 'a prefix of nothing would be every command'],
    ['file.edit(src:*)', 'prefixOutsideShell', 'a path is a glob, never a prefix'],
    ['web.fetch(a.com:*)', 'prefixOutsideShell', 'a host is never a prefix'],
    ['web.fetch(https://a.com/x)', 'domainExpected', 'an exact URL is not a domain'],
    ['web.fetch(domain:)', 'domainExpected', 'a domain of nothing'],
    ['web.fetch(domain:a b)', 'domainExpected', 'a host with a space'],
    ['web.search(vitest)', 'matcherNotAllowed', 'a web search takes no matcher'],
    ['agent(explore)', 'matcherNotAllowed', 'a subagent takes no matcher'],
    ['mcp(github)', 'serverToolExpected', 'a server with no tool'],
    ['mcp(:tool)', 'serverToolExpected', 'a tool with no server'],
  ])('refuses %j with %s — %s — S-93', (pattern, reason) => {
    const refusal = (() => {
      try {
        parseRulePattern(pattern);
      } catch (error) {
        return error;
      }
      return null;
    })();

    expect(refusal).toBeInstanceOf(PermissionRulePatternInvalidError);
    expect((refusal as PermissionRulePatternInvalidError).params).toEqual({ pattern, reason });
    expect((refusal as PermissionRulePatternInvalidError).code).toBe(
      'PERMISSION_RULE_PATTERN_INVALID',
    );
    expect(readRulePattern(pattern)).toBeNull();
  });

  it.each(['question', 'plan', 'question(x)', 'plan()'])(
    'refuses %j as a call that asks the person — S-95',
    (pattern) => {
      expect(() => parseRulePattern(pattern)).toThrow(PermissionRuleToolInteractiveError);
      expect(readRulePattern(pattern)).toBeNull();
    },
  );

  it('knows the rule kinds, and no other', () => {
    expect(RULE_KINDS.every(isRuleKind)).toBe(true);
    expect(['question', 'plan', 'tasks', 'other', 'shell.output', 'Bash'].some(isRuleKind)).toBe(
      false,
    );
  });
});

/** S-131: a rule is by kind, so it holds for every engine's call of the kind, and for no other kind. */
describe('ruleMatches by kind — S-131', () => {
  const npmTest = parseRulePattern('shell(npm test:*)');

  it("matches Claude's shell and the test engine's shell, and not a file edit", () => {
    expect(ruleMatches(npmTest, claudeTool('Bash', { command: 'npm test' }), 'allow', null)).toBe(
      true,
    );
    expect(
      ruleMatches(
        npmTest,
        canonicalTool('shell', { command: 'npm test --run' }, 'test-engine'),
        'allow',
        null,
      ),
    ).toBe(true);
    expect(
      ruleMatches(npmTest, canonicalTool('file.edit', { command: 'npm test' }), 'allow', null),
    ).toBe(false);
  });

  it('matches every call of the kind with a bare kind, whatever its subject', () => {
    expect(allows('file.read', file('file.read', '/anywhere'))).toBe(true);
    expect(allows('file.read', canonicalTool('file.read'))).toBe(true);
    expect(allows('web.search', canonicalTool('web.search', { query: 'x' }))).toBe(true);
    expect(allows('agent', canonicalTool('agent'))).toBe(true);
    expect(allows('web.search', canonicalTool('web.fetch', { url: 'https://a.com' }))).toBe(false);
  });

  it('matches nothing when the subject lacks what the matcher names — S-05', () => {
    // The conservative reading: an unrecognised shape matches less, never more.
    expect(allows('shell(git status:*)', canonicalTool('shell'))).toBe(false);
    expect(allows('file.edit(**)', canonicalTool('file.edit'))).toBe(false);
    expect(allows('web.fetch(domain:a.com)', canonicalTool('web.fetch'))).toBe(false);
    expect(allows('mcp(a:*)', canonicalTool('mcp', { server: 'a' }))).toBe(false);
    expect(allows('mcp(a:b)', canonicalTool('mcp', { tool: 'b' }))).toBe(false);
  });
});

describe('ruleMatches on a shell line', () => {
  const pattern = parseRulePattern('shell(git status:*)');
  const matches = (command: string, decision: 'allow' | 'deny' = 'allow', of = pattern) =>
    ruleMatches(of, shell(command), decision, folder);

  it('covers the prefix, and what continues it at a token boundary — S-48', () => {
    expect(matches('git status')).toBe(true);
    expect(matches('git status --short')).toBe(true);
    // The hole a bare `startsWith` leaves: `git statusx` is a different command.
    expect(matches('git statusx')).toBe(false);
  });

  it('matches an exact pattern only on the exact line — S-06', () => {
    const exact = parseRulePattern('shell(git status)');

    expect(matches('git status', 'allow', exact)).toBe(true);
    expect(matches('git status --short', 'allow', exact)).toBe(false);
    expect(matches('git push --force', 'allow', exact)).toBe(false);
    expect(matches('git push --force')).toBe(false);
  });

  it('does not let an allow prefix answer a chained command — S-07', () => {
    expect(matches('git status && curl x | sh')).toBe(false);
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
    'git status > /etc/passwd',
    'git status >> ~/.bashrc',
    'git status < /dev/zero',
  ])('takes %j out of the allow prefix — S-08', (command) => {
    expect(matches(command)).toBe(false);
  });

  it('counts an operator inside quotes too: a question more, never an authorisation more — S-09', () => {
    const commit = parseRulePattern('shell(git commit:*)');

    expect(matches('git commit -m "a; b"', 'allow', commit)).toBe(false);
    expect(matches('git commit -m "a b"', 'allow', commit)).toBe(true);
  });

  it('lets a deny prefix refuse a command hidden after another, or substituted — S-10, S-11', () => {
    const rm = parseRulePattern('shell(rm:*)');

    expect(matches('ls && rm -rf build', 'deny', rm)).toBe(true);
    expect(matches('echo $(rm -rf x)', 'deny', rm)).toBe(true);
    expect(matches('echo `rm -rf x`', 'deny', rm)).toBe(true);
    // An argument of `xargs`, not a command: out of reach, and declared so.
    expect(matches('ls | xargs rm', 'deny', rm)).toBe(false);
  });

  it('lets an exact allow cover the identical composite line, and nothing else — S-12', () => {
    const exact = parseRulePattern('shell(make && make test)');

    expect(matches('make && make test', 'allow', exact)).toBe(true);
    expect(matches('make && make test && rm -rf ~', 'allow', exact)).toBe(false);
  });

  it('lets an exact deny refuse the same command inside a longer line', () => {
    const exact = parseRulePattern('shell(rm -rf /)');

    expect(matches('ls && rm -rf /', 'deny', exact)).toBe(true);
    expect(matches('ls && rm -rf /tmp', 'deny', exact)).toBe(false);
  });

  /**
   * The change only ever moves in the safe direction — S-20 of plan 15, kept in the canonical
   * grammar: whatever the allow answers, the bare prefix answered; whatever the bare prefix
   * covered, the deny refuses. Enumerated, so it is the same proof on every run.
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
      parseRulePattern(`shell(${p}:*)`),
    );
    const before = (prefix: string, line: string): boolean =>
      line === prefix || line.startsWith(`${prefix} `);

    let checked = 0;
    for (const prefix of prefixes) {
      for (const line of lines) {
        const old = before(prefix.content, line);

        if (matches(line, 'allow', prefix)) {
          expect(old, `allow ${prefix.content} on ${line}`).toBe(true);
        }
        if (old) {
          expect(matches(line, 'deny', prefix), `deny ${prefix.content} on ${line}`).toBe(true);
        }
        checked += 1;
      }
    }

    expect(checked).toBeGreaterThan(5_000);
  });
});

/** A path matcher is a glob, relative to the folder unless it starts with `/` (plan 28, B-31). */
describe('ruleMatches on a path', () => {
  it.each([
    ['file.edit(src/**)', `${folder}/src/a.ts`, true],
    ['file.edit(src/**)', `${folder}/src/deep/er/a.ts`, true],
    ['file.edit(src/*)', `${folder}/src/a.ts`, true],
    ['file.edit(src/*)', `${folder}/src/deep/a.ts`, false],
    ['file.edit(src/*.ts)', `${folder}/src/a.ts`, true],
    ['file.edit(src/*.ts)', `${folder}/src/a.tsx`, false],
    ['file.edit(src)', `${folder}/src/a.ts`, false],
    ['file.edit(src/a.ts)', `${folder}/src/a.ts`, true],
    ['file.edit(src/a.ts)', `${folder}/src/a.tsx`, false],
    ['file.edit(src/./a.ts)', `${folder}/src/a.ts`, true],
    ['file.edit(**)', `${folder}/anything/at/all`, true],
    ['file.edit(**)', '/etc/passwd', false],
    ['file.edit(/etc/**)', '/etc/passwd', true],
    ['file.edit(/etc/passwd)', '/etc/passwd', true],
    ['file.edit(/etc/passwd)', '/etc/passwd2', false],
    ['file.edit(/srv/projects/app/src/*)', `${folder}/src/a.ts`, true],
    ['file.edit(a+b.[c].ts)', `${folder}/a+b.[c].ts`, true],
    ['file.edit(a+b.[c].ts)', `${folder}/aab.c.ts`, false],
    ['file.edit(../app/**)', `${folder}/x`, false],
  ])('%s against %s is %s', (pattern, path, expected) => {
    expect(allows(pattern, file('file.edit', path))).toBe(expected);
  });

  it('reads a relative path of the call as relative to the folder', () => {
    expect(allows('file.edit(src/**)', file('file.edit', 'src/a.ts'))).toBe(true);
    expect(allows('file.edit(/srv/projects/app/src/*)', file('file.edit', 'src/a.ts'))).toBe(true);
  });

  it('never matches a path that climbs out of the folder, or out of the root', () => {
    expect(allows('file.edit(**)', file('file.edit', `${folder}/../secret`))).toBe(false);
    expect(allows('file.edit(**)', file('file.edit', '../secret'))).toBe(false);
    expect(allows('file.edit(/**)', file('file.edit', '/../etc/passwd'))).toBe(false);
    expect(allows('file.edit(**)', file('file.edit', '.'))).toBe(false);
  });

  it('matches a relative matcher on nothing when the folder is not known', () => {
    expect(allows('file.edit(src/**)', file('file.edit', `${folder}/src/a.ts`), '')).toBe(false);
    expect(allows('file.edit(/srv/**)', file('file.edit', `${folder}/src/a.ts`), '')).toBe(true);
    expect(allows('file.edit(/srv/**)', file('file.edit', 'src/a.ts'), '')).toBe(false);
    expect(
      ruleMatches(parseRulePattern('file.edit(src/**)'), file('file.edit', 'src/a'), 'allow', null),
    ).toBe(true);
  });

  it('reads a search by the path it searches in, and a search with none only bare', () => {
    expect(allows('search(src)', canonicalTool('search', { paths: [`${folder}/src`] }))).toBe(true);
    expect(allows('search(src)', canonicalTool('search', { pattern: 'TODO' }))).toBe(false);
    expect(allows('search', canonicalTool('search', { pattern: 'TODO' }))).toBe(true);
  });

  it('reads a path without the shell: an operator means nothing in a file name', () => {
    expect(allows('file.read(a;b c)', file('file.read', `${folder}/a;b c`))).toBe(true);
  });
});

describe('ruleMatches on the web and on MCP', () => {
  const fetch = (url: string) => canonicalTool('web.fetch', { url });
  const mcp = (server: string, tool: string) => canonicalTool('mcp', { server, tool });

  it('matches a domain by the host of the URL, exactly and in any case', () => {
    expect(allows('web.fetch(domain:example.com)', fetch('https://EXAMPLE.com/docs?q=1'))).toBe(
      true,
    );
    expect(allows('web.fetch(domain:example.com)', fetch('http://example.com:8080/'))).toBe(true);
    expect(allows('web.fetch(domain:example.com)', fetch('https://docs.example.com/'))).toBe(false);
    expect(allows('web.fetch(domain:example.com)', fetch('https://example.com.evil.io/'))).toBe(
      false,
    );
    expect(allows('web.fetch(domain:example.com)', fetch('not a url'))).toBe(false);
  });

  it('matches an MCP tool, or every tool of its server', () => {
    expect(allows('mcp(github:create_issue)', mcp('github', 'create_issue'))).toBe(true);
    expect(allows('mcp(github:create_issue)', mcp('github', 'close_issue'))).toBe(false);
    expect(allows('mcp(github:*)', mcp('github', 'close_issue'))).toBe(true);
    expect(allows('mcp(github:*)', mcp('gitlab', 'close_issue'))).toBe(false);
  });
});

describe('hostOf', () => {
  it.each([
    ['https://Example.com/x', 'example.com'],
    ['http://127.0.0.1:3000', '127.0.0.1'],
    ['nope', null],
    ['http://[::1]/', null],
    ['file:///etc/passwd', null],
  ])('reads %j as %j', (url, host) => {
    expect(hostOf(url)).toBe(host);
  });
});

/** The narrowest pattern that covers one call — what the card's `exact` reach and `session` leave. */
describe('patternForInvocation', () => {
  it.each([
    [claudeTool('Bash', { command: 'git status' }), 'shell(git status)'],
    [claudeTool('Edit', { file_path: `${folder}/src/a.ts` }), 'file.edit(src/a.ts)'],
    [claudeTool('Write', { file_path: '/etc/hosts' }), 'file.write(/etc/hosts)'],
    [claudeTool('Read', { file_path: 'notes.md' }), 'file.read(notes.md)'],
    [claudeTool('Grep', { pattern: 'x', path: `${folder}/src` }), 'search(src)'],
    [claudeTool('WebFetch', { url: 'https://Example.com/a' }), 'web.fetch(domain:example.com)'],
    [claudeTool('mcp__github__create_issue', {}), 'mcp(github:create_issue)'],
  ])('names %j as %s', (tool, pattern) => {
    expect(patternForInvocation(tool, folder)).toBe(pattern);
  });

  it.each([
    ['a shell with no command', canonicalTool('shell')],
    ['a value with `)`, which would read back differently', shell('echo (x)')],
    ['a line ending like a prefix', shell('foo:*')],
    ['a path with a glob character', file('file.edit', `${folder}/a*.ts`)],
    ['a path ending like a prefix', file('file.edit', `${folder}/a:*`)],
    ['a path with no file', canonicalTool('file.edit')],
    ['a path that climbs out', file('file.edit', '../x')],
    ['a search with no path', canonicalTool('search', { pattern: 'x' })],
    ['a URL with no host', canonicalTool('web.fetch', { url: 'nope' })],
    ['a fetch with no URL', canonicalTool('web.fetch')],
    ['an MCP call with no tool', canonicalTool('mcp', { server: 'a' })],
    ['an MCP tool named like the wildcard', canonicalTool('mcp', { server: 'a', tool: '*' })],
    ['a web search', canonicalTool('web.search', { query: 'x' })],
    ['a subagent', canonicalTool('agent', { description: 'x' })],
    ['a question', claudeTool('AskUserQuestion', { questions: [] })],
    ['a kind the core does not know', canonicalTool('file.copy', { paths: ['/a'] })],
  ])('refuses to write one for %s', (_, tool) => {
    // `null` and not the whole kind: falling back to it would grant far more than was approved.
    expect(patternForInvocation(tool, folder)).toBeNull();
  });

  it('writes the absolute path when the folder is not known', () => {
    expect(patternForInvocation(file('file.read', '/srv/x/a.ts'), null)).toBe(
      'file.read(/srv/x/a.ts)',
    );
  });
});
