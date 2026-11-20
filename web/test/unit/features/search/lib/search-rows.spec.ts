import { describe, expect, it } from 'vitest';

import { copyAllTextOf, matchRowKey, searchRowsOf } from '@/features/search/lib/search-rows';
import type { SearchFileResult } from '@/features/search/types/search';

const aMatch = (line: number, column = 1) => ({
  line,
  column,
  endColumn: column + 3,
  preview: 'TODO',
  previewMatchStart: 0,
  previewMatchEnd: 4,
});

const aFile = (path: string, matches: readonly ReturnType<typeof aMatch>[]): SearchFileResult => ({
  path,
  matches,
  contextLines: [],
});

describe('searchRowsOf — plan 11, B-15', () => {
  it('shows every file expanded by default, a row per match', () => {
    const files = [aFile('a.ts', [aMatch(1), aMatch(2)]), aFile('b.ts', [aMatch(5)])];

    const rows = searchRowsOf(files, new Set(), new Set(), new Set());

    expect(rows.map((row) => [row.kind, row.path])).toEqual([
      ['file', 'a.ts'],
      ['match', 'a.ts'],
      ['match', 'a.ts'],
      ['file', 'b.ts'],
      ['match', 'b.ts'],
    ]);
  });

  it('hides the matches of a collapsed file, never its own row', () => {
    const files = [aFile('a.ts', [aMatch(1), aMatch(2)])];

    const rows = searchRowsOf(files, new Set(['a.ts']), new Set(), new Set());

    expect(rows).toEqual([
      { key: 'a.ts', kind: 'file', path: 'a.ts', matchCount: 2, collapsed: true, stale: false },
    ]);
  });

  it('leaves a dismissed file out entirely', () => {
    const files = [aFile('a.ts', [aMatch(1)]), aFile('b.ts', [aMatch(2)])];

    const rows = searchRowsOf(files, new Set(), new Set(['a.ts']), new Set());

    expect(rows.map((row) => row.path)).toEqual(['b.ts', 'b.ts']);
  });

  it('leaves one dismissed match out of its file’s count and list', () => {
    const files = [aFile('a.ts', [aMatch(1), aMatch(2)])];

    const rows = searchRowsOf(
      files,
      new Set(),
      new Set([matchRowKey('a.ts', aMatch(1))]),
      new Set(),
    );

    expect(rows).toEqual([
      { key: 'a.ts', kind: 'file', path: 'a.ts', matchCount: 1, collapsed: false, stale: false },
      { key: matchRowKey('a.ts', aMatch(2)), kind: 'match', path: 'a.ts', match: aMatch(2) },
    ]);
  });

  it('drops a file whose every match was dismissed, same as dismissing the file itself', () => {
    const files = [aFile('a.ts', [aMatch(1)])];

    const rows = searchRowsOf(
      files,
      new Set(),
      new Set([matchRowKey('a.ts', aMatch(1))]),
      new Set(),
    );

    expect(rows).toEqual([]);
  });

  it('marks a file stale without touching its matches', () => {
    const files = [aFile('a.ts', [aMatch(1)])];

    const rows = searchRowsOf(files, new Set(), new Set(), new Set(['a.ts']));

    expect(rows[0]).toMatchObject({ kind: 'file', stale: true });
  });
});

describe('copyAllTextOf — plan 11, B-15, S-118', () => {
  it('writes each file’s path, then one line per match, a blank line between files', () => {
    const rows = searchRowsOf(
      [aFile('a.ts', [aMatch(1), aMatch(2)]), aFile('b.ts', [aMatch(5)])],
      new Set(),
      new Set(),
      new Set(),
    );

    expect(copyAllTextOf(rows)).toBe('a.ts\n  1: TODO\n  2: TODO\n\nb.ts\n  5: TODO');
  });

  it('writes nothing for no rows at all', () => {
    expect(copyAllTextOf([])).toBe('');
  });
});
