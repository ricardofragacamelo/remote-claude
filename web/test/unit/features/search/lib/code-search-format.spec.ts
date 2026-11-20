import { describe, expect, it } from 'vitest';

import {
  CODE_SEARCH_EXTENSION,
  isCodeSearchFile,
  parseCodeSearch,
  searchQueryOf,
  serializeCodeSearch,
  withContextLines,
  type CodeSearchHeader,
} from '@/features/search/lib/code-search-format';
import type { SearchFileResult } from '@/features/search/types/search';

function aHeader(overrides: Partial<CodeSearchHeader> = {}): CodeSearchHeader {
  return {
    query: 'TODO',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    include: '',
    exclude: '',
    useIgnoreFiles: true,
    contextLines: 0,
    ...overrides,
  };
}

function aFile(overrides: Partial<SearchFileResult> = {}): SearchFileResult {
  return {
    path: 'src/a.ts',
    matches: [],
    contextLines: [],
    ...overrides,
  };
}

describe('serializeCodeSearch — plan 11, B-17', () => {
  it('writes every header field, with no flag set', () => {
    const text = serializeCodeSearch(aHeader({ include: '*.ts', exclude: '*.spec.ts' }), []);

    expect(text).toContain('# Query: TODO');
    expect(text).toContain('# Flags: ');
    expect(text).toContain('# Include: *.ts');
    expect(text).toContain('# Exclude: *.spec.ts');
    expect(text).toContain('# UseIgnoreFiles: true');
    expect(text).toContain('# ContextLines: 0');
  });

  it('lists every set flag, comma-separated', () => {
    const text = serializeCodeSearch(
      aHeader({ isRegex: true, caseSensitive: true, wholeWord: true }),
      [],
    );

    expect(text).toContain('# Flags: regex, caseSensitive, wholeWord');
  });

  it('writes one group per file, the path as its own header line', () => {
    const files: SearchFileResult[] = [
      aFile({
        path: 'src/a.ts',
        matches: [
          {
            line: 3,
            column: 1,
            endColumn: 5,
            preview: 'TODO fix',
            previewMatchStart: 0,
            previewMatchEnd: 4,
          },
        ],
        contextLines: [],
      }),
      aFile({ path: 'src/b.ts', matches: [], contextLines: [{ line: 10, text: 'TODO later' }] }),
    ];

    const text = serializeCodeSearch(aHeader(), files);

    expect(text).toContain('src/a.ts:\n  3: TODO fix');
    expect(text).toContain('src/b.ts:\n  10: TODO later');
  });

  it('merges a match and a context line sharing a line number, the match text winning', () => {
    const file = aFile({
      matches: [
        {
          line: 5,
          column: 1,
          endColumn: 5,
          preview: 'match text',
          previewMatchStart: 0,
          previewMatchEnd: 5,
        },
      ],
      contextLines: [{ line: 5, text: 'context text' }],
    });

    const text = serializeCodeSearch(aHeader(), [file]);

    expect(text).toContain('  5: match text');
    expect(text).not.toContain('context text');
  });

  it('orders a file’s own rows by line number, matches and context mixed', () => {
    const file = aFile({
      matches: [
        {
          line: 5,
          column: 1,
          endColumn: 5,
          preview: 'five',
          previewMatchStart: 0,
          previewMatchEnd: 4,
        },
      ],
      contextLines: [
        { line: 4, text: 'four' },
        { line: 6, text: 'six' },
      ],
    });

    const text = serializeCodeSearch(aHeader(), [file]);
    const body = text.slice(text.indexOf('src/a.ts:'));

    expect(body).toBe('src/a.ts:\n  4: four\n  5: five\n  6: six');
  });
});

describe('parseCodeSearch — plan 11, B-17', () => {
  it('round-trips a serialized document back to the same header and results', () => {
    const header = aHeader({
      isRegex: true,
      caseSensitive: true,
      include: '*.ts',
      exclude: '*.spec.ts',
      useIgnoreFiles: false,
      contextLines: 2,
    });
    const files: SearchFileResult[] = [
      aFile({
        path: 'src/a.ts',
        matches: [
          {
            line: 3,
            column: 1,
            endColumn: 5,
            preview: 'TODO fix',
            previewMatchStart: 0,
            previewMatchEnd: 4,
          },
        ],
        contextLines: [{ line: 2, text: 'before' }],
      }),
    ];

    const parsed = parseCodeSearch(serializeCodeSearch(header, files));

    expect(parsed.header).toEqual(header);
    expect([...parsed.results.values()]).toEqual([
      { path: 'src/a.ts', line: 2 },
      { path: 'src/a.ts', line: 3 },
    ]);
  });

  it('keys every result row by the buffer’s own line number', () => {
    const text = ['# Query: x', '# Flags: ', '', 'src/a.ts:', '  3: one', '  4: two'].join('\n');

    const parsed = parseCodeSearch(text);

    expect([...parsed.results.entries()]).toEqual([
      [5, { path: 'src/a.ts', line: 3 }],
      [6, { path: 'src/a.ts', line: 4 }],
    ]);
  });

  it('resumes a new file group after a blank line', () => {
    const text = ['src/a.ts:', '  1: one', '', 'src/b.ts:', '  2: two'].join('\n');

    const parsed = parseCodeSearch(text);

    expect([...parsed.results.values()]).toEqual([
      { path: 'src/a.ts', line: 1 },
      { path: 'src/b.ts', line: 2 },
    ]);
  });

  it('drops a result line with no file header above it, instead of throwing', () => {
    const parsed = parseCodeSearch('  1: orphan');

    expect(parsed.results.size).toBe(0);
  });

  it('falls back to the empty header on a file with none, instead of throwing', () => {
    const parsed = parseCodeSearch('src/a.ts:\n  1: one');

    expect(parsed.header).toEqual(aHeader({ query: '' }));
  });

  it('reads back every flag named in the header line', () => {
    const text = '# Flags: regex, caseSensitive, wholeWord\n';

    const parsed = parseCodeSearch(text);

    expect(parsed.header.isRegex).toBe(true);
    expect(parsed.header.caseSensitive).toBe(true);
    expect(parsed.header.wholeWord).toBe(true);
  });

  it('reads back false for every flag the header line omits', () => {
    const parsed = parseCodeSearch('# Flags: regex\n');

    expect(parsed.header.isRegex).toBe(true);
    expect(parsed.header.caseSensitive).toBe(false);
    expect(parsed.header.wholeWord).toBe(false);
  });

  it('ignores an unknown header field, instead of throwing', () => {
    const parsed = parseCodeSearch('# Mystery: 1\n# Query: ok\n');

    expect(parsed.header.query).toBe('ok');
  });

  it('answers an empty document for empty text', () => {
    const parsed = parseCodeSearch('');

    expect(parsed.results.size).toBe(0);
  });
});

describe('isCodeSearchFile — plan 11, B-17', () => {
  it('is true for a path ending in the search editor’s own extension', () => {
    expect(isCodeSearchFile(`results${CODE_SEARCH_EXTENSION}`)).toBe(true);
  });

  it('is false for a plain file', () => {
    expect(isCodeSearchFile('a.ts')).toBe(false);
  });
});

describe('withContextLines — plan 11, B-17', () => {
  it('replaces the header’s own ContextLines line, the rest of the text kept as it is', () => {
    const text = '# Query: x\n# ContextLines: 2\n\nsrc/a.ts:\n  1: one';

    expect(withContextLines(text, 5)).toBe('# Query: x\n# ContextLines: 5\n\nsrc/a.ts:\n  1: one');
  });

  it('leaves the text untouched when there is no ContextLines line to replace', () => {
    expect(withContextLines('# Query: x', 5)).toBe('# Query: x');
  });
});

describe('searchQueryOf — plan 11, B-17', () => {
  it('carries every header field into the request, include/exclude split into arrays', () => {
    const query = searchQueryOf(
      aHeader({ isRegex: true, include: '*.ts, *.tsx', exclude: '*.spec.ts', contextLines: 3 }),
    );

    expect(query).toEqual({
      pattern: 'TODO',
      isRegex: true,
      caseSensitive: false,
      wholeWord: false,
      useIgnoreFiles: true,
      include: ['*.ts', '*.tsx'],
      exclude: ['*.spec.ts'],
      contextLines: 3,
    });
  });

  it('leaves include/exclude out of the request when the header’s own field is empty', () => {
    const query = searchQueryOf(aHeader());

    expect(query.include).toBeUndefined();
    expect(query.exclude).toBeUndefined();
  });
});
