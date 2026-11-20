import { describe, expect, it } from 'vitest';

import { DEFAULT_SEARCH_EXCLUDE_GLOBS, searchTextArgv } from '@domain/search';
import type { SearchTextOptions } from '@domain/search';

function optionsOf(overrides: Partial<SearchTextOptions> = {}): SearchTextOptions {
  return {
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    multiline: false,
    contextLines: 0,
    respectDefaultsAndIgnoreFiles: true,
    maxFileBytes: 20_971_520,
    multilineMaxFileBytes: 5_242_880,
    ...overrides,
  };
}

describe('searchTextArgv', () => {
  it('always carries --json and never a shell flag', () => {
    const args = searchTextArgv('needle', optionsOf());

    expect(args).toContain('--json');
    expect(args).not.toContain('--max-columns');
  });

  it('passes the pattern as --regexp=, never a bare positional', () => {
    const args = searchTextArgv('-weird-pattern', optionsOf());

    expect(args).toContain('--regexp=-weird-pattern');
  });

  it('uses --ignore-case by default, --case-sensitive when asked', () => {
    expect(searchTextArgv('x', optionsOf({ caseSensitive: false }))).toContain('--ignore-case');
    expect(searchTextArgv('x', optionsOf({ caseSensitive: true }))).toContain('--case-sensitive');
  });

  it('adds --word-regexp only when wholeWord is set', () => {
    expect(searchTextArgv('x', optionsOf({ wholeWord: true }))).toContain('--word-regexp');
    expect(searchTextArgv('x', optionsOf({ wholeWord: false }))).not.toContain('--word-regexp');
  });

  it('adds --fixed-strings for literal mode, never for regex mode', () => {
    expect(searchTextArgv('x', optionsOf({ isRegex: false }))).toContain('--fixed-strings');
    expect(searchTextArgv('x', optionsOf({ isRegex: true }))).not.toContain('--fixed-strings');
  });

  it('adds --multiline only when the query turned it on, and picks the smaller file ceiling', () => {
    const multiline = searchTextArgv(
      'x',
      optionsOf({ multiline: true, multilineMaxFileBytes: 123 }),
    );
    const single = searchTextArgv('x', optionsOf({ multiline: false, maxFileBytes: 456 }));

    expect(multiline).toContain('--multiline');
    expect(multiline).toContain('--max-filesize=123');
    expect(single).not.toContain('--multiline');
    expect(single).toContain('--max-filesize=456');
  });

  it('adds --context= only when contextLines is above zero', () => {
    expect(searchTextArgv('x', optionsOf({ contextLines: 3 }))).toContain('--context=3');
    expect(searchTextArgv('x', optionsOf({ contextLines: 0 })).join(' ')).not.toContain(
      '--context=',
    );
  });

  it('applies the default excludes, plus .git always, when respecting defaults', () => {
    const args = searchTextArgv('x', optionsOf({ respectDefaultsAndIgnoreFiles: true }));

    expect(args).toContain('--glob=!.git');
    for (const glob of DEFAULT_SEARCH_EXCLUDE_GLOBS) {
      expect(args).toContain(`--glob=!${glob}`);
    }
  });

  it('skips the defaults and sets --no-ignore when defaults are switched off, but keeps .git out', () => {
    const args = searchTextArgv('x', optionsOf({ respectDefaultsAndIgnoreFiles: false }));

    expect(args).toContain('--no-ignore');
    expect(args).toContain('--glob=!.git');
    expect(args).not.toContain(`--glob=!${DEFAULT_SEARCH_EXCLUDE_GLOBS[0]}`);
  });

  it('adds an include glob without the ! negation', () => {
    const args = searchTextArgv('x', optionsOf({ include: ['src/**'] }));

    expect(args).toContain('--glob=src/**');
  });

  it('adds an exclude glob with the ! negation, on top of the defaults', () => {
    const args = searchTextArgv('x', optionsOf({ exclude: ['vendor/**'] }));

    expect(args).toContain('--glob=!vendor/**');
  });

  it('never adds --replace — measured: --json ignores it entirely (B-11)', () => {
    expect(searchTextArgv('x', optionsOf()).join(' ')).not.toContain('--replace=');
  });

  it('lists onlyPaths as positional arguments after --', () => {
    const args = searchTextArgv('x', optionsOf({ onlyPaths: ['a.ts', 'b.ts'] }));

    const dashDash = args.indexOf('--');
    expect(args.slice(dashDash + 1)).toEqual(['a.ts', 'b.ts']);
  });

  it('names . explicitly when there is no onlyPaths — never a bare --', () => {
    // Measured: with no path argument at all, ripgrep decides whether to search the folder or
    // read its own stdin by whether stdin is a pipe — which a spawned child's always is, even
    // closed and empty. An explicit path rules that out.
    const args = searchTextArgv('x', optionsOf());

    expect(args.slice(-2)).toEqual(['--', '.']);
  });
});
