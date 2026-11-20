import { describe, expect, it } from 'vitest';

import { DEFAULT_SEARCH_EXCLUDE_GLOBS, locateArgv } from '@domain/search';

describe('locateArgv', () => {
  it('always excludes .git, even with defaults switched off — D-03', () => {
    const args = locateArgv({ respectDefaultsAndIgnoreFiles: false });

    expect(args).toContain('--glob=!.git');
  });

  it('applies the default exclude globs when defaults are respected', () => {
    const args = locateArgv({ respectDefaultsAndIgnoreFiles: true });

    for (const glob of DEFAULT_SEARCH_EXCLUDE_GLOBS) {
      expect(args).toContain(`--glob=!${glob}`);
    }
    expect(args).not.toContain('--no-ignore');
  });

  it('switches off the defaults and the ignore files together — the one D-03 toggle', () => {
    const args = locateArgv({ respectDefaultsAndIgnoreFiles: false });

    expect(args).toContain('--no-ignore');
    for (const glob of DEFAULT_SEARCH_EXCLUDE_GLOBS) {
      expect(args).not.toContain(`--glob=!${glob}`);
    }
  });

  it('appends a caller-given exclude glob on top of the defaults', () => {
    const args = locateArgv({
      respectDefaultsAndIgnoreFiles: true,
      excludeGlobs: ['vendor/**'],
    });

    expect(args).toContain('--glob=!vendor/**');
  });

  it('ends with --, and no explicit path — which would prefix every result with ./', () => {
    const args = locateArgv({ respectDefaultsAndIgnoreFiles: true });

    expect(args.at(-1)).toBe('--');
  });

  it('never builds a single joined command string — every flag is its own element', () => {
    const args = locateArgv({ respectDefaultsAndIgnoreFiles: true, excludeGlobs: ['a b c'] });

    expect(args.every((element) => !element.includes(' ') || element === '--glob=!a b c')).toBe(
      true,
    );
    expect(args).toContain('--hidden');
    expect(args).toContain('--files');
  });
});
