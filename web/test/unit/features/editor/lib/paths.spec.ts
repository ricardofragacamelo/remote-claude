import { describe, expect, it } from 'vitest';

import { baseName, crumbsOf, joinPath, parentOf, retarget } from '@/features/editor/lib/paths';

describe('paths of a folder', () => {
  it('name the file and its directory', () => {
    expect(baseName('src/app/main.ts')).toBe('main.ts');
    expect(baseName('main.ts')).toBe('main.ts');
    expect(parentOf('src/app/main.ts')).toBe('src/app');
    expect(parentOf('main.ts')).toBe('');
    expect(joinPath('', 'a')).toBe('a');
    expect(joinPath('src', 'a')).toBe('src/a');
  });

  it('follow a move — the entry itself, or anything under a directory that moved', () => {
    expect(retarget('src/a.ts', 'src/a.ts', 'lib/a.ts')).toBe('lib/a.ts');
    expect(retarget('src/app/a.ts', 'src', 'lib')).toBe('lib/app/a.ts');
    expect(retarget('srcx/a.ts', 'src', 'lib')).toBeNull();
  });

  it('give the way to a file, one directory at a time — S-220', () => {
    expect(crumbsOf('src/app/main.ts')).toEqual([
      { name: 'src', directory: '' },
      { name: 'app', directory: 'src' },
      { name: 'main.ts', directory: 'src/app' },
    ]);
  });
});
