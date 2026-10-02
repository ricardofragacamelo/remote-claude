import { describe, expect, it } from 'vitest';

import { FilePath, InvalidFilePathError, MAX_SEGMENT_BYTES } from '@domain/files';
import { WorkspaceNotAllowedError, WorkspacePath } from '@domain/workspace';

const folder = WorkspacePath.create('/srv/projects/app');

/** The rules an invalid path broke, in order. */
function rulesOf(attempt: () => unknown): string[] {
  try {
    attempt();
  } catch (error) {
    if (error instanceof InvalidFilePathError) {
      return error.details.map((detail) => `${detail.field}:${detail.rule}`);
    }
    throw error;
  }

  throw new Error('it was accepted');
}

describe('FilePath', () => {
  it('resolves a relative path to the absolute one inside the folder — S-14', () => {
    const path = FilePath.create(folder, 'src/a.ts');

    expect(path.relative).toBe('src/a.ts');
    expect(path.absolute).toBe('/srv/projects/app/src/a.ts');
    expect(path.name).toBe('a.ts');
    expect(path.toString()).toBe('src/a.ts');
  });

  it("is the folder itself for '' and for '.' — S-15", () => {
    for (const raw of ['', '.', './', 'src/..']) {
      const path = FilePath.create(folder, raw);

      expect(path.isFolder).toBe(true);
      expect(path.absolute).toBe('/srv/projects/app');
      expect(path.name).toBe('');
    }
  });

  it.each([['../other'], ['a/../../x'], ['..'], ['src/../../app-evil/x']])(
    'refuses %s, which climbs out, before any I/O — S-16, S-20',
    (raw) => {
      expect(() => FilePath.create(folder, raw)).toThrow(WorkspaceNotAllowedError);
    },
  );

  it('normalises a climb that stays inside — S-17', () => {
    expect(FilePath.create(folder, 'a/../b/./c//d/').relative).toBe('b/c/d');
  });

  it('refuses an absolute path, a NUL and a backslash, every rule at once — S-18', () => {
    expect(rulesOf(() => FilePath.create(folder, '/etc\\pa\0ss', 'from'))).toEqual([
      'from:mustBeRelative',
      'from:mustNotContainNul',
      'from:mustNotContainBackslash',
    ]);
  });

  describe('a path that names a new entry', () => {
    it.each([['a/'], ['a/.'], ['a/..'], ['']])('refuses %j, which names no entry — S-86', (raw) => {
      expect(rulesOf(() => FilePath.naming(folder, raw))).toEqual(['path:mustNameAnEntry']);
    });

    it('takes a segment of 255 bytes and refuses one of 256, counting bytes — S-87', () => {
      expect(FilePath.naming(folder, 'n'.repeat(MAX_SEGMENT_BYTES)).name).toHaveLength(255);
      expect(rulesOf(() => FilePath.naming(folder, `${'n'.repeat(256)}/x`))).toEqual([
        'path:segmentTooLong',
      ]);
      // 128 accented letters are 256 bytes.
      expect(rulesOf(() => FilePath.naming(folder, 'é'.repeat(128)))).toEqual([
        'path:segmentTooLong',
      ]);
    });

    it('reports a format rule and a naming rule together', () => {
      expect(rulesOf(() => FilePath.naming(folder, '/a/..', 'to'))).toEqual([
        'to:mustBeRelative',
        'to:mustNameAnEntry',
      ]);
    });

    it('still refuses a name that climbs out', () => {
      expect(() => FilePath.naming(folder, '../x')).toThrow(WorkspaceNotAllowedError);
    });
  });

  describe('relations', () => {
    const src = FilePath.create(folder, 'src');

    it('knows its parent, its children and its siblings — the folder is its own parent', () => {
      expect(FilePath.create(folder, 'src/a.ts').parent().relative).toBe('src');
      expect(src.parent().isFolder).toBe(true);
      expect(src.parent().parent().isFolder).toBe(true);
      expect(FilePath.create(folder, '').child('x').relative).toBe('x');
      expect(src.child('a.ts').relative).toBe('src/a.ts');
      expect(src.child('a.ts').sibling('b.ts').relative).toBe('src/b.ts');
    });

    it('contains itself and what is under it, and nothing that merely starts like it — S-92', () => {
      expect(src.contains(FilePath.create(folder, 'src'))).toBe(true);
      expect(src.contains(FilePath.create(folder, 'src/deep/x'))).toBe(true);
      expect(src.contains(FilePath.create(folder, 'src-evil'))).toBe(false);
      expect(FilePath.create(folder, '').contains(src)).toBe(true);
    });

    it('is equal to the same path of the same folder only', () => {
      const elsewhere = WorkspacePath.create('/srv/projects/other');

      expect(src.equals(FilePath.create(folder, 'src/'))).toBe(true);
      expect(src.equals(FilePath.create(elsewhere, 'src'))).toBe(false);
      expect(src.equals(FilePath.create(folder, 'lib'))).toBe(false);
    });

    it('says whether a real path the disk reported stays inside the folder', () => {
      expect(FilePath.staysInside(folder, '/srv/projects/app/x')).toBe(true);
      expect(FilePath.staysInside(folder, '/srv/projects/app')).toBe(true);
      expect(FilePath.staysInside(folder, '/srv/projects/app-evil/x')).toBe(false);
      expect(FilePath.staysInside(folder, 'relative/x')).toBe(false);
    });
  });
});
