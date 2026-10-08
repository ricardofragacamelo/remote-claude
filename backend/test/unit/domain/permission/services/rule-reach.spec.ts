import { describe, expect, it } from 'vitest';

import {
  UNBOUNDED_COMMANDS,
  commandPrefix,
  isRuleReach,
  parseRulePattern,
  reachesFor,
  readRulePattern,
} from '@domain/permission';

/**
 * How far a rule left by an answer may reach — plan 23, B-09.
 *
 * A pure function of the invocation: what the card offers and what an answer is checked against
 * are the same call, so every case is also a case of what the server will accept.
 */
describe('reachesFor', () => {
  const shell = (command: string) => reachesFor('Bash', { command });

  it('offers the exact command and its prefix — S-45', () => {
    expect(shell('git push -u origin x')).toEqual([
      { reach: 'exact', patterns: ['Bash(git push -u origin x)'] },
      { reach: 'prefix', patterns: ['Bash(git push:*)'] },
    ]);
  });

  it.each([
    ['ls -la', 'Bash(ls:*)'],
    ['cat file.txt', 'Bash(cat:*)'],
    ['pnpm test', 'Bash(pnpm test:*)'],
    ['rm build', 'Bash(rm build:*)'],
    ['git status', 'Bash(git status:*)'],
    ['pnpm run:dev', 'Bash(pnpm run:dev:*)'],
  ])('reads the prefix of %s as %s — S-46', (command, pattern) => {
    expect(shell(command).find((reach) => reach.reach === 'prefix')?.patterns).toEqual([pattern]);
  });

  it('gives a pattern per command of a line, without repeating one — S-47', () => {
    expect(shell('git push 2>&1 | tail -5 && git status && git push')).toContainEqual({
      reach: 'prefix',
      patterns: ['Bash(git push:*)', 'Bash(tail:*)', 'Bash(git status:*)'],
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
    ['Edit', { file_path: '/a/b.ts' }, 'Edit(/a/b.ts)'],
    ['Write', { file_path: '/a/c.ts' }, 'Write(/a/c.ts)'],
    ['Read', { file_path: '/a/d.ts' }, 'Read(/a/d.ts)'],
    ['WebFetch', { url: 'https://example.com' }, 'WebFetch(https://example.com)'],
  ])('offers %s exactly and as the whole tool — S-51', (toolName, input, exact) => {
    expect(reachesFor(toolName, input)).toEqual([
      { reach: 'exact', patterns: [exact] },
      { reach: 'tool', patterns: [toolName] },
    ]);
  });

  it.each([
    ['WebSearch', { query: 'vitest' }],
    ['mcp__productdock__list_work_items', {}],
  ])(
    'offers %s only as the whole tool, with nothing a pattern can name — S-51',
    (toolName, input) => {
      expect(reachesFor(toolName, input)).toEqual([{ reach: 'tool', patterns: [toolName] }]);
    },
  );

  it('never offers the whole shell — S-52', () => {
    expect(shell('ls').map((reach) => reach.reach)).not.toContain('tool');
    expect(reachesFor('Bash', {})).toEqual([]);
  });

  it('offers no exact for a value with `)`, and the prefix when it has none — S-53', () => {
    expect(shell('echo )')).toEqual([{ reach: 'prefix', patterns: ['Bash(echo:*)'] }]);
    expect(shell('(cd x)')).toEqual([]);
  });

  it('offers nothing for a tool whose name is outside the grammar', () => {
    expect(reachesFor('mcp__claude-vscode__getDiagnostics', {})).toEqual([]);
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

        expect(read.kind).toBe(reach.reach === 'prefix' ? 'prefix' : 'exact');
        expect(`${read.toolName}(${read.content}${read.kind === 'prefix' ? ':*' : ''})`).toBe(
          pattern,
        );
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

describe('readRulePattern', () => {
  it.each(['', 'Bash()', 'Bash(:*)', '1Bash', 'mcp__a-b__c', 'Bash(x'])(
    'answers null where parseRulePattern throws: %j',
    (pattern) => {
      expect(readRulePattern(pattern)).toBeNull();
      expect(() => parseRulePattern(pattern)).toThrow();
    },
  );
});
