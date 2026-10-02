import { describe, expect, it } from 'vitest';

import { duplicateName } from '@/features/explorer/lib/duplicate-name';

/** A folder that has these names. */
const holding =
  (...names: string[]) =>
  (candidate: string): boolean =>
    names.includes(candidate);

describe('duplicateName — plan 07, S-103', () => {
  it('names the first copy `name copy.ext`', () => {
    expect(duplicateName('index.ts', holding('index.ts'))).toBe('index copy.ts');
  });

  it('counts on when the first copy is taken, never colliding', () => {
    expect(duplicateName('index.ts', holding('index.ts', 'index copy.ts', 'index copy 2.ts'))).toBe(
      'index copy 3.ts',
    );
  });

  it('keeps everything before the last dot as the name', () => {
    expect(duplicateName('archive.tar.gz', holding())).toBe('archive.tar copy.gz');
  });

  it('reads a leading dot as part of the name, and a name with no dot as all name', () => {
    expect(duplicateName('.env', holding())).toBe('.env copy');
    expect(duplicateName('Makefile', holding('Makefile copy'))).toBe('Makefile copy 2');
  });

  it('duplicates a folder the same way', () => {
    expect(duplicateName('src', holding('src'))).toBe('src copy');
  });
});
