import { describe, expect, it } from 'vitest';

import {
  changeDiffSides,
  nameOf,
  relativeTo,
  sideKeyFrom,
  toolDiffSides,
} from '@/features/session/lib/diff-sides';

describe('the sides of a diff of what Claude changed — plan 08, B-27, B-28', () => {
  it('names a file relative to the folder of the tab, or not at all outside it', () => {
    expect(relativeTo('/srv/app', '/srv/app/src/a.ts')).toBe('src/a.ts');
    expect(relativeTo('/srv/app/', '/srv/app/a.ts')).toBe('a.ts');
    expect(relativeTo('/srv/app', '/srv/other/a.ts')).toBeNull();
    expect(nameOf('/srv/app/src/a.ts')).toBe('a.ts');
  });

  it('makes the two sides of a tool provided by the session, each with its own key', () => {
    const { left, right } = toolDiffSides('/srv/app', 's1', 'toolu_1', '/srv/app/a.ts');

    expect(left).toMatchObject({
      path: 'a.ts',
      source: 'provided',
      provided: { source: 'session', labelKey: 'sessions.diff.before' },
    });
    expect(sideKeyFrom(left.provided?.key ?? '')).toEqual({
      sessionId: 's1',
      toolUseId: 'toolu_1',
      path: '/srv/app/a.ts',
      side: 'before',
    });
    expect(sideKeyFrom(right.provided?.key ?? '')).toMatchObject({ side: 'after' });
  });

  it('puts the disk on the right of a change in the folder, and the session’s "now" outside it', () => {
    expect(changeDiffSides('/srv/app', 's1', '/srv/app/a.ts').right).toEqual({
      path: 'a.ts',
      source: 'disk',
    });

    const outside = changeDiffSides('/srv/app/sub', 's1', '/srv/app/a.ts');
    expect(outside.left).toMatchObject({
      path: 'a.ts',
      provided: { labelKey: 'sessions.diff.beforeSession' },
    });
    expect(outside.right).toMatchObject({
      source: 'provided',
      provided: { labelKey: 'sessions.diff.now' },
    });
  });

  it('trusts only a key it made', () => {
    expect(sideKeyFrom('not json')).toBeNull();
    expect(sideKeyFrom('[]')).toBeNull();
    expect(sideKeyFrom(JSON.stringify({ sessionId: 's', path: '/a', side: 'middle' }))).toBeNull();
    expect(sideKeyFrom(JSON.stringify({ sessionId: 's', path: '/a', side: 'after' }))).toEqual({
      sessionId: 's',
      path: '/a',
      side: 'after',
    });
  });
});
