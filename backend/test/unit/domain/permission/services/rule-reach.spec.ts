import { describe, expect, it } from 'vitest';

import {
  UNBOUNDED_COMMANDS,
  commandPrefix,
  isRuleReach,
  parseRulePattern,
  reachesFor,
} from '@domain/permission';
import { canonicalTool, claudeTool } from '../../../../support/builders/tool.builder';

const folder = '/srv/projects/app';

/**
 * How far a rule left by an answer may reach — plan 23, B-09.
 *
 * A pure function of the invocation: what the card offers and what an answer is checked against
 * are the same call, so every case is also a case of what the server will accept.
 */
describe('reachesFor', () => {
  const shell = (command: string) => reachesFor(claudeTool('Bash', { command }), folder);

  it('offers the exact command and its prefix — S-45', () => {
    expect(shell('git push -u origin x')).toEqual([
      { reach: 'exact', patterns: ['shell(git push -u origin x)'] },
      { reach: 'prefix', patterns: ['shell(git push:*)'] },
    ]);
  });

  it.each([
    ['ls -la', 'shell(ls:*)'],
    ['cat file.txt', 'shell(cat:*)'],
    ['pnpm test', 'shell(pnpm test:*)'],
    ['rm build', 'shell(rm build:*)'],
    ['git status', 'shell(git status:*)'],
    ['pnpm run:dev', 'shell(pnpm run:dev:*)'],
  ])('reads the prefix of %s as %s — S-46', (command, pattern) => {
    expect(shell(command).find((reach) => reach.reach === 'prefix')?.patterns).toEqual([pattern]);
  });

  it('gives a pattern per command of a line, without repeating one — S-47', () => {
    expect(shell('git push 2>&1 | tail -5 && git status && git push')).toContainEqual({
      reach: 'prefix',
      patterns: ['shell(git push:*)', 'shell(tail:*)', 'shell(git status:*)'],
    });
  });

  it.each([
    'bash -c "x"',
    'sh x.sh',
    'npx x',
    'sudo ls',
    'python a.py',
    'python3.12 a.py',
    'xargs rm',
    'pnpm dlx x',
    'npm exec x',
    'ls | xargs rm',
  ])('offers no prefix for %s, whose prefix would be any command — S-48', (command) => {
    expect(shell(command).map((reach) => reach.reach)).not.toContain('prefix');
  });

  it('offers no prefix past an environment assignment — S-49', () => {
    expect(shell('FOO=1 pnpm test').map((reach) => reach.reach)).toEqual(['exact']);
  });

  it.each(['cat `id`', 'git commit -m "a && b"', 'ls > out.txt'])(
    'offers only the exact command for %s, which cannot be read safely — S-50',
    (command) => {
      expect(shell(command).map((reach) => reach.reach)).toEqual(['exact']);
    },
  );

  it.each([
    ['Edit', { file_path: `${folder}/b.ts` }, 'file.edit(b.ts)', 'file.edit'],
    ['MultiEdit', { file_path: `${folder}/src/b.ts` }, 'file.edit(src/b.ts)', 'file.edit'],
    ['Write', { file_path: '/a/c.ts' }, 'file.write(/a/c.ts)', 'file.write'],
    ['Read', { file_path: `${folder}/d.ts` }, 'file.read(d.ts)', 'file.read'],
    ['Grep', { pattern: 'x', path: `${folder}/src` }, 'search(src)', 'search'],
    ['WebFetch', { url: 'https://example.com/a?b' }, 'web.fetch(domain:example.com)', 'web.fetch'],
    // The whole tool of an MCP server is its server's tools, never every MCP call.
    [
      'mcp__productdock__list_work_items',
      {},
      'mcp(productdock:list_work_items)',
      'mcp(productdock:*)',
    ],
  ])('offers %s exactly and as the whole kind — S-51, S-92', (toolName, input, exact, kind) => {
    expect(reachesFor(claudeTool(toolName, input, folder), folder)).toEqual([
      { reach: 'exact', patterns: [exact] },
      { reach: 'tool', patterns: [kind] },
    ]);
  });

  it('offers an MCP call with no readable server only as the bare kind', () => {
    const tool = { kind: 'mcp', subject: { tool: 'x' } };
    expect(reachesFor(tool, folder)).toEqual([{ reach: 'tool', patterns: ['mcp'] }]);
    expect(reachesFor({ kind: 'mcp', subject: { server: '', tool: 'x' } }, folder)).toEqual([
      { reach: 'tool', patterns: ['mcp'] },
    ]);
    expect(reachesFor({ kind: 'mcp', subject: { server: 'a)b', tool: 'x' } }, folder)).toEqual([
      { reach: 'tool', patterns: ['mcp'] },
    ]);
  });

  it.each([
    ['WebSearch', { query: 'vitest' }, 'web.search'],
    ['Glob', { pattern: '**/*.ts' }, 'search'],
    ['Agent', { description: 'explore' }, 'agent'],
  ])(
    'offers %s only as the whole kind, with nothing a pattern can name — S-51',
    (toolName, input, kind) => {
      expect(reachesFor(claudeTool(toolName, input, folder), folder)).toEqual([
        { reach: 'tool', patterns: [kind] },
      ]);
    },
  );

  it('never offers the whole shell — S-52', () => {
    expect(shell('ls').map((reach) => reach.reach)).not.toContain('tool');
    expect(reachesFor(canonicalTool('shell'), folder)).toEqual([]);
  });

  it('offers no exact for a value with `)`, and the prefix when it has none — S-53', () => {
    expect(shell('echo )')).toEqual([{ reach: 'prefix', patterns: ['shell(echo:*)'] }]);
    expect(shell('(cd x)')).toEqual([]);
  });

  it.each([
    ['AskUserQuestion', { questions: [] }],
    ['ExitPlanMode', { plan: '# x' }],
    ['TodoWrite', { todos: [] }],
    ['BashOutput', {}],
    ['LS', { path: '/a' }],
  ])('offers nothing for %s, whose kind takes no rule — S-95', (toolName, input) => {
    expect(reachesFor(claudeTool(toolName, input, folder), folder)).toEqual([]);
  });

  it('offers the same reaches for the same kind of any engine — S-131', () => {
    expect(
      reachesFor(canonicalTool('shell', { command: 'npm test' }, 'test-engine'), folder),
    ).toEqual(reachesFor(claudeTool('Bash', { command: 'npm test' }), folder));
  });

  it('offers no exact that would read back as a prefix', () => {
    expect(shell('foo:*').map((reach) => reach.reach)).toEqual(['prefix']);
  });

  it.each([
    ['git push 2>&1 | tail -5'],
    ['cd /srv/app && pnpm test --run'],
    ['echo )'],
    ['ls -la'],
  ])('builds only patterns that read back as written, for %s — S-54', (command) => {
    for (const reach of shell(command)) {
      for (const pattern of reach.patterns) {
        const read = parseRulePattern(pattern);

        expect(read.reach).toBe(reach.reach === 'prefix' ? 'prefix' : 'exact');
        expect(`${read.kind}(${read.content}${read.reach === 'prefix' ? ':*' : ''})`).toBe(pattern);
      }
    }
  });
});

describe('commandPrefix', () => {
  it.each(['', '   ', '"./x" run', '$CMD run', 'FOO=1 x', '(x)'])('has none for %j', (command) => {
    expect(commandPrefix(command)).toBeNull();
  });

  it.each([...UNBOUNDED_COMMANDS].filter((command) => !command.includes(' ')))(
    'has none for the unbounded %s',
    (command) => {
      expect(commandPrefix(`${command} something`)).toBeNull();
    },
  );

  it('keeps the second token only when it reads as a subcommand', () => {
    expect(commandPrefix('git push --force')).toBe('git push');
    expect(commandPrefix('git --version')).toBe('git');
    expect(commandPrefix('docker Run')).toBe('docker');
  });
});

describe('the reach names', () => {
  it.each(['exact', 'prefix', 'tool'])('knows %s', (reach) => {
    expect(isRuleReach(reach)).toBe(true);
  });

  it.each(['', 'Exact', 'glob', 'all'])('does not know %j', (reach) => {
    expect(isRuleReach(reach)).toBe(false);
  });
});
