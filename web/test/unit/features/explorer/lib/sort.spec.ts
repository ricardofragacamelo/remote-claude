import { describe, expect, it } from 'vitest';

import {
  extensionOf,
  isExpandable,
  isFolderLike,
  isOperable,
  sortEntries,
} from '@/features/explorer/lib/sort';
import type { TreeEntry } from '@/features/explorer/types/explorer';

function anEntry(name: string, extra: Partial<TreeEntry> = {}): TreeEntry {
  return {
    name,
    path: name,
    kind: 'file',
    size: 0,
    mtime: '2026-09-30T12:00:00.000Z',
    hidden: false,
    unreadableName: false,
    outside: false,
    targetKind: null,
    ...extra,
  };
}

describe('what an entry is', () => {
  it('opens a folder, and a link inside that leads to one — never a link out', () => {
    expect(isFolderLike(anEntry('d', { kind: 'directory' }))).toBe(true);
    expect(isFolderLike(anEntry('l', { kind: 'symlink', targetKind: 'directory' }))).toBe(true);
    expect(
      isFolderLike(anEntry('o', { kind: 'symlink', targetKind: 'directory', outside: true })),
    ).toBe(false);
    expect(isFolderLike(anEntry('f', { kind: 'symlink', targetKind: 'file' }))).toBe(false);
    expect(isExpandable(anEntry('u', { kind: 'directory', unreadableName: true }))).toBe(false);
  });

  it('acts on neither a name that is not text nor a link out', () => {
    expect(isOperable(anEntry('a'))).toBe(true);
    expect(isOperable(anEntry('a', { unreadableName: true }))).toBe(false);
    expect(isOperable(anEntry('a', { outside: true }))).toBe(false);
  });

  it('reads an extension past the last dot, a leading dot not counting', () => {
    expect(extensionOf('a.TS')).toBe('ts');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
    expect(extensionOf('.env')).toBe('');
    expect(extensionOf('Makefile')).toBe('');
  });
});

describe('the order of a level — S-165', () => {
  const entries = [
    anEntry('b10.md', { mtime: '2026-09-30T10:00:00.000Z' }),
    anEntry('b9.md', { mtime: '2026-09-30T10:00:00.000Z' }),
    anEntry('a.ts', { mtime: '2026-09-30T12:00:00.000Z' }),
    anEntry('z', { kind: 'directory' }),
    anEntry('B.json', { mtime: '2026-09-30T11:00:00.000Z' }),
  ];

  it('by name, numbers as numbers, case aside, folders first', () => {
    expect(sortEntries(entries, 'name').map((each) => each.name)).toEqual([
      'z',
      'a.ts',
      'B.json',
      'b9.md',
      'b10.md',
    ]);
  });

  it('by type, then by name', () => {
    expect(sortEntries(entries, 'type').map((each) => each.name)).toEqual([
      'z',
      'B.json',
      'b9.md',
      'b10.md',
      'a.ts',
    ]);
  });

  it('by last modified, newest first, then by name', () => {
    expect(sortEntries(entries, 'modified').map((each) => each.name)).toEqual([
      'z',
      'a.ts',
      'B.json',
      'b9.md',
      'b10.md',
    ]);
  });

  it('tells apart names the collator calls equal', () => {
    expect(sortEntries([anEntry('A'), anEntry('a')], 'name').map((each) => each.name)).toEqual(
      sortEntries([anEntry('a'), anEntry('A')], 'name').map((each) => each.name),
    );
  });
});
