import { describe, expect, it } from 'vitest';

import { KNOWN_TOOL_KINDS, pathsChangedBy, toolKindKey } from '@domain/engine';

/** The two rules of the canonical tool every engine shares — plan 28, B-15 and B-16. */
describe('the canonical tool', () => {
  describe('toolKindKey — the part of an i18n key that names a kind', () => {
    it.each([
      ['file.read', 'fileRead'],
      ['file.edit', 'fileEdit'],
      ['file.write', 'fileWrite'],
      ['file.delete', 'fileDelete'],
      ['file.move', 'fileMove'],
      ['shell', 'shell'],
      ['shell.output', 'shellOutput'],
      ['web.fetch', 'webFetch'],
      ['web.search', 'webSearch'],
      ['other', 'other'],
    ])('names %s as %s', (kind, key) => {
      expect(toolKindKey(kind)).toBe(key);
    });

    it('names a kind this build never heard of by the same rule, with no table to keep', () => {
      expect(toolKindKey('vcs.commit.amend')).toBe('vcsCommitAmend');
      expect(toolKindKey('')).toBe('');
    });

    it('gives every known kind a key with no dot left in it', () => {
      for (const kind of KNOWN_TOOL_KINDS) {
        expect(toolKindKey(kind)).toMatch(/^[a-z][A-Za-z]*$/);
      }
    });
  });

  describe('pathsChangedBy — what the undo snapshots before a call runs (ADR-013)', () => {
    it('is each change`s file, in order', () => {
      expect(
        pathsChangedBy({
          changes: [
            { path: '/srv/a.ts', op: 'edit', edits: [] },
            { path: '/srv/b.ts', op: 'write', content: 'x' },
            { path: '/srv/c.ts', op: 'delete' },
          ],
        }),
      ).toEqual(['/srv/a.ts', '/srv/b.ts', '/srv/c.ts']);
    });

    it('is both ends of a move: where the file was, and where it goes', () => {
      expect(
        pathsChangedBy({ changes: [{ path: '/srv/a.ts', op: 'move', to: '/srv/b.ts' }] }),
      ).toEqual(['/srv/a.ts', '/srv/b.ts']);
    });

    it('is only the source of a move that says no destination', () => {
      expect(pathsChangedBy({ changes: [{ path: '/srv/a.ts', op: 'move' }] })).toEqual([
        '/srv/a.ts',
      ]);
    });

    it('is nothing for a call that changes no file — a shell stays out, as it always did', () => {
      expect(pathsChangedBy({ changes: [] })).toEqual([]);
    });
  });
});
