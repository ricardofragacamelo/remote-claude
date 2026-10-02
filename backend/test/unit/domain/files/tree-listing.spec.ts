import { describe, expect, it } from 'vitest';

import { FilePath, HIDDEN_NAMES, listTree } from '@domain/files';
import type { TreeChild } from '@domain/files';
import { WorkspacePath } from '@domain/workspace';

const folder = WorkspacePath.create('/srv/projects/app');
const mtime = new Date('2026-09-30T12:00:00.000Z');

function child(name: string, overrides: Partial<TreeChild> = {}): TreeChild {
  return { name, kind: 'file', size: 1, mtime, unreadableName: false, target: null, ...overrides };
}

const list = (children: readonly TreeChild[], exhausted = true, limit = 100) =>
  listTree({ directory: FilePath.create(folder, 'src'), children, exhausted, limit });

describe('listTree', () => {
  it('puts folders first — and links to folders inside — then names ignoring case, numbers natural — S-28', () => {
    const listing = list([
      child('b.ts'),
      child('item10.ts'),
      child('Zeta', { kind: 'directory' }),
      child('A.ts'),
      child('item2.ts'),
      child('alpha', { kind: 'directory' }),
      child('to-lib', {
        kind: 'symlink',
        target: { realPath: '/srv/projects/app/lib', kind: 'directory' },
      }),
    ]);

    expect(listing.entries.map((entry) => entry.name)).toEqual([
      'alpha',
      'to-lib',
      'Zeta',
      'A.ts',
      'b.ts',
      'item2.ts',
      'item10.ts',
    ]);
    expect(listing.entries[0]?.path).toBe('src/alpha');
  });

  it('keeps two names that differ only in case in a fixed order', () => {
    const one = list([child('a'), child('A')]).entries.map((entry) => entry.name);
    const other = list([child('A'), child('a')]).entries.map((entry) => entry.name);

    expect(one).toEqual(other);
  });

  it('marks what the explorer hides, never leaves it out — S-38', () => {
    const listing = list(HIDDEN_NAMES.map((name) => child(name)).concat(child('.env')));

    expect(
      listing.entries
        .filter((entry) => entry.hidden)
        .map((entry) => entry.name)
        .sort(),
    ).toEqual([...HIDDEN_NAMES].sort());
    expect(listing.entries.find((entry) => entry.name === '.env')?.hidden).toBe(false);
  });

  it('says where a link inside leads, hides where one outside does, and says a broken one is — S-34', () => {
    const listing = list([
      child('inside', {
        kind: 'symlink',
        target: { realPath: '/srv/projects/app/a.ts', kind: 'file' },
      }),
      child('outside', { kind: 'symlink', target: { realPath: '/etc/passwd', kind: 'file' } }),
      child('broken', { kind: 'symlink', target: { realPath: null, kind: 'missing' } }),
      child('plain'),
    ]);
    const byName = Object.fromEntries(listing.entries.map((entry) => [entry.name, entry.symlink]));

    expect(byName).toEqual({
      inside: { outside: false, targetKind: 'file' },
      outside: { outside: true, targetKind: null },
      broken: { outside: false, targetKind: 'missing' },
      plain: null,
    });
  });

  it('says truncated when the port stopped, or when there is more than the ceiling — S-30', () => {
    expect(list([child('a'), child('b')], true, 2).truncated).toBe(false);
    expect(list([child('a'), child('b'), child('c')], false, 2)).toMatchObject({ truncated: true });
    expect(list([child('a'), child('b'), child('c')], true, 2).entries).toHaveLength(2);
  });
});
