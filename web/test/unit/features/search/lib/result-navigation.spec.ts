import { describe, expect, it } from 'vitest';

import { stepResult } from '@/features/search/lib/result-navigation';
import type { SearchRow } from '@/features/search/lib/search-rows';
import type { SearchMatch } from '@/features/search/types/search';

function aMatch(preview = 'TODO'): SearchMatch {
  return { line: 1, column: 1, endColumn: 5, preview, previewMatchStart: 0, previewMatchEnd: 4 };
}

function fileRow(path: string, matchCount: number): SearchRow {
  return { key: path, kind: 'file', path, matchCount, collapsed: false, stale: false };
}

function matchRow(key: string, path: string): SearchRow {
  return { key, kind: 'match', path, match: aMatch() };
}

const ROWS: readonly SearchRow[] = [
  fileRow('a.ts', 2),
  matchRow('a:1', 'a.ts'),
  matchRow('a:2', 'a.ts'),
  fileRow('b.ts', 1),
  matchRow('b:1', 'b.ts'),
];

describe('stepResult — plan 11, B-19, S-141', () => {
  it('answers null with no match row at all', () => {
    expect(stepResult([fileRow('a.ts', 0)], null, 1)).toBeNull();
    expect(stepResult([], 'anything', -1)).toBeNull();
  });

  it('starts at the first match for F4 with nothing active yet', () => {
    expect(stepResult(ROWS, null, 1)).toMatchObject({ key: 'a:1' });
  });

  it('starts at the last match for Shift+F4 with nothing active yet', () => {
    expect(stepResult(ROWS, null, -1)).toMatchObject({ key: 'b:1' });
  });

  it('moves to the next match in tree order', () => {
    expect(stepResult(ROWS, 'a:1', 1)).toMatchObject({ key: 'a:2' });
    expect(stepResult(ROWS, 'a:2', 1)).toMatchObject({ key: 'b:1' });
  });

  it('wraps from the last match back to the first — S-141', () => {
    expect(stepResult(ROWS, 'b:1', 1)).toMatchObject({ key: 'a:1' });
  });

  it('wraps from the first match back to the last, going backward', () => {
    expect(stepResult(ROWS, 'a:1', -1)).toMatchObject({ key: 'b:1' });
  });

  it('moves to the previous match in tree order', () => {
    expect(stepResult(ROWS, 'b:1', -1)).toMatchObject({ key: 'a:2' });
  });

  it('starts over at the first match for F4 when the active key is no longer among the rows', () => {
    expect(stepResult(ROWS, 'gone', 1)).toMatchObject({ key: 'a:1' });
  });
});
