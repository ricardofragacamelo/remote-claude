import { describe, expect, it } from 'vitest';

import {
  absoluteOf,
  ancestorsOf,
  childOf,
  isWithin,
  nameOf,
  outermost,
  parentOf,
  rebased,
} from '@/features/explorer/lib/paths';

describe('paths relative to the open folder', () => {
  it('splits a path into its folder and its name', () => {
    expect(parentOf('src/a.ts')).toBe('src');
    expect(parentOf('a.ts')).toBe('');
    expect(nameOf('src/deep/a.ts')).toBe('a.ts');
    expect(nameOf('a.ts')).toBe('a.ts');
    expect(childOf('', 'a.ts')).toBe('a.ts');
    expect(childOf('src', 'a.ts')).toBe('src/a.ts');
  });

  it('knows what is inside what — and that the folder itself holds everything', () => {
    expect(isWithin('src/a.ts', 'src')).toBe(true);
    expect(isWithin('src', 'src')).toBe(true);
    expect(isWithin('srcx/a.ts', 'src')).toBe(false);
    expect(isWithin('anything', '')).toBe(true);
  });

  it('lists the folders above an entry, outermost first', () => {
    expect(ancestorsOf('a/b/c.ts')).toEqual(['a', 'a/b']);
    expect(ancestorsOf('c.ts')).toEqual([]);
  });

  it('rebases what moved with a folder', () => {
    expect(rebased('src', 'src', 'lib')).toBe('lib');
    expect(rebased('src/a.ts', 'src', 'lib')).toBe('lib/a.ts');
  });

  it.each([
    ['/srv/app', 'src/a.ts', '/srv/app/src/a.ts'],
    ['/srv/app/', 'a.ts', '/srv/app/a.ts'],
    ['/srv/app', '', '/srv/app'],
    ['/', 'a.ts', '/a.ts'],
    ['/', '', '/'],
  ])('makes %s + %s absolute', (folder, path, absolute) => {
    expect(absoluteOf(folder, path)).toBe(absolute);
  });

  it('keeps only the outermost of nested entries', () => {
    expect(outermost(['src', 'src/a.ts', 'b.ts', 'src/deep/c.ts'])).toEqual(['src', 'b.ts']);
  });
});
