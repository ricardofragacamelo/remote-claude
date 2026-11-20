import { describe, expect, it } from 'vitest';

import { parseCodeSearch } from '@/features/search/lib/code-search-format';
import { resultsEditorContentOf } from '@/features/search/lib/results-editor-content';
import type { ResultsEditorFlags } from '@/features/search/lib/results-editor-content';
import type { SearchRow } from '@/features/search/lib/search-rows';

function aFlags(overrides: Partial<ResultsEditorFlags> = {}): ResultsEditorFlags {
  return {
    query: 'TODO',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    include: '',
    exclude: '',
    useIgnoreFiles: true,
    ...overrides,
  };
}

function aMatchRow(path: string, line: number, preview: string): SearchRow {
  return {
    key: `${path}:${String(line)}`,
    kind: 'match',
    path,
    match: { line, column: 1, endColumn: 5, preview, previewMatchStart: 0, previewMatchEnd: 4 },
  };
}

function aFileRow(path: string, matchCount: number): SearchRow {
  return { key: path, kind: 'file', path, matchCount, collapsed: false, stale: false };
}

describe('resultsEditorContentOf — plan 11, B-17', () => {
  it('starts the header from the view’s own flags, with a context-lines default inside 1–9', () => {
    const text = resultsEditorContentOf(aFlags({ query: 'fix' }), []);
    const { header } = parseCodeSearch(text);

    expect(header.query).toBe('fix');
    expect(header.contextLines).toBeGreaterThanOrEqual(1);
    expect(header.contextLines).toBeLessThanOrEqual(9);
  });

  it('groups match rows back under their own file, in the order the rows came in', () => {
    const rows: readonly SearchRow[] = [
      aFileRow('src/a.ts', 2),
      aMatchRow('src/a.ts', 3, 'first'),
      aMatchRow('src/a.ts', 4, 'second'),
      aFileRow('src/b.ts', 1),
      aMatchRow('src/b.ts', 10, 'third'),
    ];

    const { results } = parseCodeSearch(resultsEditorContentOf(aFlags(), rows));

    expect([...results.values()]).toEqual([
      { path: 'src/a.ts', line: 3 },
      { path: 'src/a.ts', line: 4 },
      { path: 'src/b.ts', line: 10 },
    ]);
  });

  it('writes nothing in the body for a file row left with no match row', () => {
    const text = resultsEditorContentOf(aFlags(), [aFileRow('src/a.ts', 0)]);

    expect(parseCodeSearch(text).results.size).toBe(0);
  });

  it('answers just the header, with no file group, for no rows at all', () => {
    const { results } = parseCodeSearch(resultsEditorContentOf(aFlags(), []));

    expect(results.size).toBe(0);
  });
});
