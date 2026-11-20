import { describe, expect, it } from 'vitest';

import {
  locateQuerySchema,
  searchReplaceApplyBodySchema,
  searchReplacePreviewBodySchema,
  searchTextBodySchema,
  toLocateDto,
  toSearchReplaceApplyResultDto,
  toSearchReplacePreviewEndFrame,
  toSearchReplacePreviewErrorFrame,
  toSearchReplacePreviewFileFrame,
  toSearchTextEndFrame,
  toSearchTextErrorFrame,
  toSearchTextFileFrame,
} from '@adapter/inbound/http/search/search.dto';
import type {
  LocateResult,
  SearchFileResult,
  SearchReplaceApplyReport,
  SearchReplacePreviewFileResult,
} from '@application/search';
import { SearchEngineFailedError } from '@domain/search';

describe('locateQuerySchema', () => {
  const base = { folder: '/srv/app' };

  it('defaults kinds to file, prefer to empty, and query to empty', () => {
    const parsed = locateQuerySchema.parse(base);

    expect(parsed.kinds).toEqual(['file']);
    expect(parsed.prefer).toEqual([]);
    expect(parsed.query).toBe('');
    expect(parsed.includeIgnored).toBe(false);
  });

  it('splits a comma-separated kinds into an array', () => {
    const parsed = locateQuerySchema.parse({ ...base, kinds: 'file,dir' });

    expect(parsed.kinds).toEqual(['file', 'dir']);
  });

  it('refuses a kind that is not file or dir', () => {
    expect(() => locateQuerySchema.parse({ ...base, kinds: 'symlink' })).toThrow();
  });

  it('wraps a single prefer into an array', () => {
    const parsed = locateQuerySchema.parse({ ...base, prefer: 'src/a.ts' });

    expect(parsed.prefer).toEqual(['src/a.ts']);
  });

  it('keeps prefer as given when it is already repeated', () => {
    const parsed = locateQuerySchema.parse({ ...base, prefer: ['src/a.ts', 'src/b.ts'] });

    expect(parsed.prefer).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('coerces limit to a number', () => {
    const parsed = locateQuerySchema.parse({ ...base, limit: '25' });

    expect(parsed.limit).toBe(25);
  });

  it('reads includeIgnored=true literally', () => {
    const parsed = locateQuerySchema.parse({ ...base, includeIgnored: 'true' });

    expect(parsed.includeIgnored).toBe(true);
  });

  it('refuses a folder that is not absolute', () => {
    expect(() => locateQuerySchema.parse({ folder: 'relative/path' })).toThrow();
  });
});

describe('toLocateDto', () => {
  it('maps entries and a null truncation', () => {
    const result: LocateResult = {
      entries: [
        { path: 'src/a.ts', kind: 'file', positions: [0, 1] },
        { path: 'src', kind: 'dir', positions: [] },
      ],
      truncated: null,
      skipped: 0,
    };

    expect(toLocateDto(result)).toEqual({
      entries: [
        { path: 'src/a.ts', kind: 'file', positions: [0, 1] },
        { path: 'src', kind: 'dir', positions: [] },
      ],
      truncated: null,
      skipped: 0,
    });
  });

  it('carries the truncation reason through', () => {
    const result: LocateResult = { entries: [], truncated: { reason: 'limit' }, skipped: 0 };

    expect(toLocateDto(result).truncated).toEqual({ reason: 'limit' });
  });

  it('carries the skipped count through — S-63', () => {
    const result: LocateResult = { entries: [], truncated: null, skipped: 3 };

    expect(toLocateDto(result).skipped).toBe(3);
  });
});

describe('searchTextBodySchema', () => {
  const base = {
    folder: '/srv/app',
    pattern: 'needle',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    useIgnoreFiles: true,
  };

  it('parses a minimal well-formed body', () => {
    const parsed = searchTextBodySchema.parse(base);

    expect(parsed).toMatchObject({ folder: '/srv/app', pattern: 'needle' });
    expect(parsed.include).toBeUndefined();
    expect(parsed.contextLines).toBeUndefined();
  });

  it('refuses a folder that is not absolute', () => {
    expect(() => searchTextBodySchema.parse({ ...base, folder: 'relative' })).toThrow();
  });

  it('refuses a body missing a required flag', () => {
    const withoutIsRegex: Record<string, unknown> = { ...base };
    delete withoutIsRegex['isRegex'];

    expect(() => searchTextBodySchema.parse(withoutIsRegex)).toThrow();
  });

  it('carries include, exclude, onlyPaths and contextLines through', () => {
    const parsed = searchTextBodySchema.parse({
      ...base,
      include: ['src/**'],
      exclude: ['**/*.test.ts'],
      onlyPaths: ['src/a.ts'],
      contextLines: 2,
    });

    expect(parsed.include).toEqual(['src/**']);
    expect(parsed.exclude).toEqual(['**/*.test.ts']);
    expect(parsed.onlyPaths).toEqual(['src/a.ts']);
    expect(parsed.contextLines).toBe(2);
  });

  it('refuses more context lines than this edge allows', () => {
    expect(() => searchTextBodySchema.parse({ ...base, contextLines: 1000 })).toThrow();
  });

  it('refuses a negative contextLines', () => {
    expect(() => searchTextBodySchema.parse({ ...base, contextLines: -1 })).toThrow();
  });
});

describe('toSearchTextFileFrame', () => {
  it('maps a file result to the file frame, matches and context lines included', () => {
    const file: SearchFileResult = {
      path: 'src/a.ts',
      matches: [
        {
          line: 1,
          column: 3,
          endColumn: 9,
          preview: 'a needle here',
          previewMatchStart: 2,
          previewMatchEnd: 8,
        },
      ],
      contextLines: [{ line: 2, text: 'next line' }],
    };

    expect(toSearchTextFileFrame(file)).toEqual({
      type: 'file',
      path: 'src/a.ts',
      matches: [
        {
          line: 1,
          column: 3,
          endColumn: 9,
          preview: 'a needle here',
          previewMatchStart: 2,
          previewMatchEnd: 8,
        },
      ],
      contextLines: [{ line: 2, text: 'next line' }],
    });
  });
});

describe('toSearchTextEndFrame', () => {
  it('carries truncated and skipped through', () => {
    expect(toSearchTextEndFrame({ reason: 'limit' }, 3)).toEqual({
      type: 'end',
      truncated: { reason: 'limit' },
      skipped: 3,
    });
  });

  it('carries a null truncation through', () => {
    expect(toSearchTextEndFrame(null, 0)).toEqual({ type: 'end', truncated: null, skipped: 0 });
  });
});

describe('toSearchTextErrorFrame', () => {
  it('carries code, messageKey and params through, never the technical message', () => {
    const error = new SearchEngineFailedError('rg crashed');

    expect(toSearchTextErrorFrame(error)).toEqual({
      type: 'error',
      code: 'SEARCH_ENGINE_FAILED',
      messageKey: 'search.error.engineFailed',
      params: {},
    });
  });
});

describe('searchReplacePreviewBodySchema', () => {
  const base = {
    folder: '/srv/app',
    pattern: 'needle',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    useIgnoreFiles: true,
    replacement: 'found',
    preserveCase: false,
  };

  it('parses a minimal well-formed body', () => {
    const parsed = searchReplacePreviewBodySchema.parse(base);

    expect(parsed).toMatchObject({ replacement: 'found', preserveCase: false });
  });

  it('refuses a body missing preserveCase', () => {
    const withoutPreserveCase: Record<string, unknown> = { ...base };
    delete withoutPreserveCase['preserveCase'];

    expect(() => searchReplacePreviewBodySchema.parse(withoutPreserveCase)).toThrow();
  });
});

describe('toSearchReplacePreviewFileFrame', () => {
  it('carries path, etag and every match, replacement included', () => {
    const file: SearchReplacePreviewFileResult = {
      path: 'src/a.ts',
      etag: 'abc123',
      matches: [
        {
          line: 1,
          column: 3,
          endColumn: 9,
          preview: 'a needle here',
          previewMatchStart: 2,
          previewMatchEnd: 8,
          replacement: 'found',
        },
      ],
    };

    expect(toSearchReplacePreviewFileFrame(file)).toEqual({
      type: 'file',
      path: 'src/a.ts',
      etag: 'abc123',
      matches: [
        {
          line: 1,
          column: 3,
          endColumn: 9,
          preview: 'a needle here',
          previewMatchStart: 2,
          previewMatchEnd: 8,
          replacement: 'found',
        },
      ],
    });
  });
});

describe('toSearchReplacePreviewEndFrame', () => {
  it('carries truncated and skipped through', () => {
    expect(toSearchReplacePreviewEndFrame({ reason: 'timeout' }, 2)).toEqual({
      type: 'end',
      truncated: { reason: 'timeout' },
      skipped: 2,
    });
  });
});

describe('toSearchReplacePreviewErrorFrame', () => {
  it('carries code, messageKey and params through', () => {
    const error = new SearchEngineFailedError('rg crashed');

    expect(toSearchReplacePreviewErrorFrame(error)).toEqual({
      type: 'error',
      code: 'SEARCH_ENGINE_FAILED',
      messageKey: 'search.error.engineFailed',
      params: {},
    });
  });
});

describe('searchReplaceApplyBodySchema', () => {
  const base = {
    folder: '/srv/app',
    pattern: 'needle',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    useIgnoreFiles: true,
    replacement: 'found',
    preserveCase: false,
    files: [{ path: 'a.ts', etag: 'abc' }],
  };

  it('parses a minimal well-formed body', () => {
    const parsed = searchReplaceApplyBodySchema.parse(base);

    expect(parsed.files).toEqual([{ path: 'a.ts', etag: 'abc' }]);
  });

  it('refuses a body with an absurd number of files, well above the real ceiling', () => {
    const files = Array.from({ length: 10_001 }, (_, index) => ({
      path: `a${String(index)}.ts`,
      etag: 'x',
    }));

    expect(() => searchReplaceApplyBodySchema.parse({ ...base, files })).toThrow();
  });

  it('accepts an empty files array', () => {
    expect(() => searchReplaceApplyBodySchema.parse({ ...base, files: [] })).not.toThrow();
  });
});

describe('toSearchReplaceApplyResultDto', () => {
  it('carries every list of the report through', () => {
    const report: SearchReplaceApplyReport = {
      applied: ['a.ts'],
      changed: ['b.ts'],
      missing: ['c.ts'],
      skipped: [{ path: 'd.ts', reason: 'binary' }],
    };

    expect(toSearchReplaceApplyResultDto(report)).toEqual({
      report: {
        applied: ['a.ts'],
        changed: ['b.ts'],
        missing: ['c.ts'],
        skipped: [{ path: 'd.ts', reason: 'binary' }],
      },
    });
  });
});
