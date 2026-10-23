import { describe, expect, it } from 'vitest';

import { diffLines, linesOf, projectEntryDiffHunks } from '@/features/mcp/lib/project-entry-diff';
import type { DiffableEntry } from '@/features/mcp/lib/project-entry-diff';

const BASE: DiffableEntry = {
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'server'],
  url: null,
  env: [{ name: 'TOKEN', value: 'x' }],
  headers: [],
};

describe('linesOf', () => {
  it('renders one line per field, env sorted by name', () => {
    const lines = linesOf({
      ...BASE,
      env: [
        { name: 'B', value: '2' },
        { name: 'A', value: '1' },
      ],
    });

    expect(lines).toEqual([
      'transport: stdio',
      'command: npx',
      'args: -y server',
      'url: (none)',
      'env:',
      '  A=1',
      '  B=2',
      'headers:',
      '  (none)',
    ]);
  });

  it('says "(none)" for an empty command, args, url or variable list', () => {
    const lines = linesOf({
      transport: 'http',
      command: null,
      args: [],
      url: null,
      env: [],
      headers: [],
    });

    expect(lines).toContain('command: (none)');
    expect(lines).toContain('args: (none)');
    expect(lines).toContain('url: (none)');
  });
});

describe('diffLines', () => {
  it('reports no change when both sides are identical', () => {
    const lines = diffLines(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(lines.every((line) => line.kind === 'context')).toBe(true);
  });

  it('reports a removed line and an added line for a changed one', () => {
    const lines = diffLines(['a', 'b', 'c'], ['a', 'x', 'c']);
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'x' },
      { kind: 'context', text: 'c' },
    ]);
  });

  it('reports lines added at the end', () => {
    const lines = diffLines(['a'], ['a', 'b']);
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'added', text: 'b' },
    ]);
  });

  it('reports lines removed from the end', () => {
    const lines = diffLines(['a', 'b'], ['a']);
    expect(lines).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'removed', text: 'b' },
    ]);
  });

  it('handles two completely different sides, each line either removed or added', () => {
    const lines = diffLines(['a', 'b'], ['c', 'd']);
    expect(lines.map((l) => l.kind)).toEqual(['removed', 'removed', 'added', 'added']);
  });

  it('handles an empty before or an empty after', () => {
    expect(diffLines([], ['a'])).toEqual([{ kind: 'added', text: 'a' }]);
    expect(diffLines(['a'], [])).toEqual([{ kind: 'removed', text: 'a' }]);
    expect(diffLines([], [])).toEqual([]);
  });
});

describe('projectEntryDiffHunks', () => {
  it('answers no hunk at all when the approval kept no snapshot (D-80)', () => {
    expect(projectEntryDiffHunks(null, BASE)).toEqual([]);
  });

  it('answers one hunk, starting at line 1 on both sides', () => {
    const hunks = projectEntryDiffHunks(BASE, { ...BASE, command: 'node' });
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ oldStart: 1, newStart: 1 });
  });

  it('the hunk carries the actual line diff of the two renderings', () => {
    const hunks = projectEntryDiffHunks(BASE, { ...BASE, command: 'node' });
    const changed = hunks[0]?.lines.filter((line) => line.kind !== 'context');
    expect(changed).toEqual([
      { kind: 'removed', text: 'command: npx' },
      { kind: 'added', text: 'command: node' },
    ]);
  });
});
