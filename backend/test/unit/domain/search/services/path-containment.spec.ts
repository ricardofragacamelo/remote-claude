import { describe, expect, it } from 'vitest';

import { containedRelativePath } from '@domain/search';

describe('containedRelativePath', () => {
  it('normalises an ordinary relative path', () => {
    expect(containedRelativePath('src/a.ts')).toBe('src/a.ts');
  });

  it('collapses a ./ and an internal ../ that still lands inside — S-17-equivalent', () => {
    expect(containedRelativePath('./src/a.ts')).toBe('src/a.ts');
    expect(containedRelativePath('src/b/../a.ts')).toBe('src/a.ts');
  });

  it('answers the folder itself for the empty string', () => {
    expect(containedRelativePath('')).toBe('');
  });

  it('refuses an absolute path — S-32, S-35', () => {
    expect(containedRelativePath('/etc/passwd')).toBeNull();
  });

  it('refuses a path carrying ~ — S-32', () => {
    expect(containedRelativePath('~/secrets')).toBeNull();
  });

  it('refuses a path that climbs above the folder — S-32, S-35', () => {
    expect(containedRelativePath('../outside')).toBeNull();
    expect(containedRelativePath('a/../../outside')).toBeNull();
  });

  it('leaves glob wildcards untouched — S-33', () => {
    expect(containedRelativePath('**/*.ts')).toBe('**/*.ts');
    expect(containedRelativePath('src/**/node_modules')).toBe('src/**/node_modules');
  });

  it('refuses a glob that climbs above the folder before any wildcard', () => {
    expect(containedRelativePath('../**/*.ts')).toBeNull();
  });
});
