import { describe, expect, it } from 'vitest';

import {
  GlobOutsideFolderError,
  PathOutsideFolderError,
  SearchPatternInvalidError,
  SearchQuery,
  SearchQueryInvalidError,
} from '@domain/search';

function queryOf(overrides: Partial<Parameters<typeof SearchQuery.create>[0]> = {}) {
  return SearchQuery.create({
    pattern: 'needle',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    ...overrides,
  });
}

describe('SearchQuery.create', () => {
  it('builds a query from well-formed input', () => {
    const query = queryOf({ include: ['src/**'], exclude: ['**/node_modules/**'] });

    expect(query.pattern).toBe('needle');
    expect(query.include).toEqual(['src/**']);
    expect(query.exclude).toEqual(['**/node_modules/**']);
    expect(query.onlyPaths).toEqual([]);
  });

  it('refuses an empty pattern — S-25', () => {
    expect(() => queryOf({ pattern: '' })).toThrow(SearchQueryInvalidError);
    try {
      queryOf({ pattern: '' });
    } catch (error) {
      expect((error as SearchQueryInvalidError).details).toEqual([
        { field: 'pattern', rule: 'patternRequired' },
      ]);
    }
  });

  it('refuses a pattern above the length ceiling — S-26', () => {
    expect(() => queryOf({ pattern: 'a'.repeat(1_001) })).toThrow(SearchQueryInvalidError);
  });

  it('refuses a lookahead as an unsupported regex feature — S-28', () => {
    expect(() => queryOf({ pattern: '(?=x)', isRegex: true })).toThrow(SearchPatternInvalidError);
  });

  it('refuses a backreference as an unsupported regex feature — S-28', () => {
    expect(() => queryOf({ pattern: '(a)\\1', isRegex: true })).toThrow(SearchPatternInvalidError);
  });

  it('never flags lookaround syntax when the pattern is literal, not regex', () => {
    expect(() => queryOf({ pattern: '(?=x)', isRegex: false })).not.toThrow();
  });

  it('refuses more globs than the ceiling allows — S-34', () => {
    expect(() =>
      queryOf({ include: Array.from({ length: 65 }, (_, index) => `g${String(index)}`) }),
    ).toThrow(SearchQueryInvalidError);
  });

  it('collects every violated field at once — S-44', () => {
    try {
      queryOf({ pattern: '', include: Array.from({ length: 65 }, () => 'g') });
      expect.unreachable();
    } catch (error) {
      expect((error as SearchQueryInvalidError).details).toHaveLength(2);
    }
  });

  it('refuses an include glob that reaches outside the folder — S-32', () => {
    expect(() => queryOf({ include: ['../outside'] })).toThrow(GlobOutsideFolderError);
  });

  it('refuses an exclude glob that is absolute — S-32', () => {
    expect(() => queryOf({ exclude: ['/etc/passwd'] })).toThrow(GlobOutsideFolderError);
  });

  it('refuses an onlyPaths entry outside the folder — S-35', () => {
    expect(() => queryOf({ onlyPaths: ['../secret.ts'] })).toThrow(PathOutsideFolderError);
  });

  it('a glob starting with - is accepted as data, never as an option — S-33', () => {
    expect(() => queryOf({ include: ['-weird-name/**'] })).not.toThrow();
  });

  it('turns multiline on by itself when the pattern carries a newline — S-38', () => {
    expect(queryOf({ pattern: 'a\nb' }).multiline).toBe(true);
    expect(queryOf({ pattern: 'a' }).multiline).toBe(false);
  });

  it('carries no replacement at all for a plain search', () => {
    expect(queryOf().replacement).toBeUndefined();
  });

  it('carries the replacement through when one is given — B-11', () => {
    expect(queryOf({ replacement: 'found' }).replacement).toBe('found');
  });

  it('refuses a numbered capture-group reference in a regex replacement — S-82', () => {
    expect(() => queryOf({ isRegex: true, replacement: '$1' })).toThrow(SearchPatternInvalidError);
  });

  it('refuses a named capture-group reference in a regex replacement — S-82', () => {
    expect(() => queryOf({ isRegex: true, replacement: '${name}' })).toThrow(
      SearchPatternInvalidError,
    );
  });

  it('never refuses $0, the whole match, in a regex replacement', () => {
    expect(() => queryOf({ isRegex: true, replacement: '[$0]' })).not.toThrow();
  });

  it('never refuses a group-looking reference when the pattern is literal — S-96', () => {
    expect(() => queryOf({ isRegex: false, replacement: '$1' })).not.toThrow();
  });
});
