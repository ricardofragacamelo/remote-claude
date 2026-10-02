import { describe, expect, it } from 'vitest';

import { ENTRY_ICONS, iconNameOf } from '@/features/explorer/lib/file-icons';
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

describe('the icon of an entry — B-25', () => {
  it.each([
    [anEntry('x', { unreadableName: true }), false, 'unreadable'],
    [anEntry('x', { kind: 'symlink', outside: true }), false, 'outside'],
    [anEntry('d', { kind: 'directory' }), false, 'folder'],
    [anEntry('d', { kind: 'directory' }), true, 'folderOpen'],
    [anEntry('l', { kind: 'symlink', targetKind: 'directory' }), false, 'folderLink'],
    [anEntry('l', { kind: 'symlink', targetKind: 'file' }), false, 'link'],
    [anEntry('a.ts'), false, 'code'],
    [anEntry('data.JSON'), false, 'json'],
    [anEntry('notes.md'), false, 'text'],
    [anEntry('Dockerfile'), false, 'config'],
    [anEntry('Makefile'), false, 'terminal'],
    [anEntry('.env'), false, 'config'],
    [anEntry('photo.png'), false, 'image'],
    [anEntry('song.mp3'), false, 'audio'],
    [anEntry('clip.mp4'), false, 'video'],
    [anEntry('pack.zip'), false, 'archive'],
    [anEntry('run.sh'), false, 'terminal'],
    [anEntry('mystery.xyz'), false, 'file'],
    [anEntry('noextension'), false, 'file'],
  ] as const)('draws %o (open: %s) as %s', (entry, expanded, name) => {
    expect(iconNameOf(entry, expanded)).toBe(name);
    expect(ENTRY_ICONS[iconNameOf(entry, expanded)]).toBeDefined();
  });
});
