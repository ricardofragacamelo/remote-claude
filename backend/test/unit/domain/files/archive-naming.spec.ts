import { describe, expect, it } from 'vitest';

import { FilePath, archiveNaming, outermost } from '@domain/files';
import { WorkspacePath } from '@domain/workspace';

const folder = WorkspacePath.create('/srv/app');
const at = (relative: string): FilePath => FilePath.create(folder, relative);

/** The names inside a zip of a selection — plan 07, B-48, S-297, S-359. */
describe('archiveNaming', () => {
  it('names a folder from itself down', () => {
    const naming = archiveNaming(['src/lib'], folder.value);

    expect(naming.nameOf('src/lib')).toBe('lib');
    expect(naming.nameOf('src/lib/a.ts')).toBe('lib/a.ts');
    expect(naming.fileName).toBe('lib.zip');
  });

  it('names one file by its name', () => {
    const naming = archiveNaming(['docs/guide.md'], folder.value);

    expect(naming.nameOf('docs/guide.md')).toBe('guide.md');
    expect(naming.fileName).toBe('guide.md.zip');
  });

  it('names a selection relative to the deepest folder that holds it all — S-359', () => {
    const naming = archiveNaming(['src/a.ts', 'src/b.ts', 'src/lib'], folder.value);

    expect(naming.nameOf('src/a.ts')).toBe('a.ts');
    expect(naming.nameOf('src/lib/c.ts')).toBe('lib/c.ts');
    expect(naming.fileName).toBe('src.zip');
  });

  it('keeps the folders that tell two items apart, and falls back to the open folder', () => {
    const naming = archiveNaming(['a/x.txt', 'b/x.txt'], folder.value);

    expect(naming.nameOf('a/x.txt')).toBe('a/x.txt');
    expect(naming.nameOf('b/x.txt')).toBe('b/x.txt');
    expect(naming.fileName).toBe('app.zip');
  });

  it('puts the open folder under its own name', () => {
    const naming = archiveNaming([''], folder.value);

    expect(naming.nameOf('')).toBe('app');
    expect(naming.nameOf('src/a.ts')).toBe('app/src/a.ts');
    expect(naming.fileName).toBe('app.zip');
  });

  it('calls a zip of the root of a disk something', () => {
    expect(archiveNaming([''], '/').fileName).toBe('archive.zip');
  });
});

describe('outermost', () => {
  it('drops what another selected item holds, and repeats, keeping the order', () => {
    const kept = outermost([at('src/a.ts'), at('docs'), at('src'), at('docs'), at('docs/x.md')]);

    expect(kept.map((entry) => entry.relative)).toEqual(['docs', 'src']);
  });

  it('keeps only the open folder when it is selected', () => {
    expect(outermost([at('src'), at('')]).map((entry) => entry.relative)).toEqual(['']);
  });

  it('keeps siblings whose names only start alike — the separator is the point', () => {
    expect(outermost([at('src'), at('src2')]).map((entry) => entry.relative)).toEqual([
      'src',
      'src2',
    ]);
  });
});
