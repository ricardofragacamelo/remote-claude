import { describe, expect, it } from 'vitest';

import {
  UNWATCHED_PATHS,
  batchOf,
  coalesceChanges,
  foldChange,
  isUnwatched,
  relativeTo,
  takesAway,
} from '@domain/files';
import type { ChangeKind, FolderChange } from '@domain/files';

const change = (path: string, kind: ChangeKind): FolderChange => ({ path, kind });

describe('what the watcher leaves alone — D-10, B-20', () => {
  it.each([
    ['.git', true],
    ['.git/HEAD', true],
    ['node_modules', true],
    ['packages/web/node_modules/react/index.js', true],
    ['dist/app.js', true],
    ['crates/core/target/debug', true],
    ['.venv/lib', true],
    ['build', true],
    ['sub/.git/objects/ab', true],
  ])('leaves %s alone', (path, unwatched) => {
    expect(isUnwatched(path)).toBe(unwatched);
  });

  it.each(['', 'src', 'src/a.ts', 'distance/a.ts', 'my-build/x', '.github/workflows', 'git'])(
    'watches %s',
    (path) => {
      expect(isUnwatched(path)).toBe(false);
    },
  );

  it('matches a run of segments, and not a segment that only starts like one', () => {
    expect(UNWATCHED_PATHS).toContain('.git/objects');
    expect(isUnwatched('a/.gitx/objects')).toBe(false);
  });
});

describe('folding the changes of a window — B-20', () => {
  it.each([
    [undefined, 'created', 'created'],
    [undefined, 'changed', 'changed'],
    [undefined, 'deleted', 'deleted'],
    ['created', 'changed', 'created'],
    ['created', 'created', 'created'],
    ['created', 'deleted', null],
    ['changed', 'changed', 'changed'],
    ['changed', 'deleted', 'deleted'],
    ['deleted', 'created', 'changed'],
    ['deleted', 'changed', 'changed'],
    ['deleted', 'deleted', 'deleted'],
  ] as const)('%s then %s is %s', (previous, next, folded) => {
    expect(foldChange(previous, next)).toBe(folded);
  });

  it('turns a burst on one file into one changed — S-131', () => {
    const burst = Array.from({ length: 500 }, () => change('a.ts', 'changed'));

    expect(coalesceChanges(burst)).toEqual([change('a.ts', 'changed')]);
  });

  it('says nothing of a file created and deleted inside the window — S-132', () => {
    expect(
      coalesceChanges([
        change('tmp', 'created'),
        change('tmp', 'changed'),
        change('tmp', 'deleted'),
      ]),
    ).toEqual([]);
  });

  it('tells a rename as the old path deleted and the new one created — S-130', () => {
    expect(coalesceChanges([change('old.ts', 'deleted'), change('new.ts', 'created')])).toEqual([
      change('old.ts', 'deleted'),
      change('new.ts', 'created'),
    ]);
  });

  it('keeps a path created again after it cancelled out', () => {
    expect(
      coalesceChanges([change('a', 'created'), change('a', 'deleted'), change('a', 'created')]),
    ).toEqual([change('a', 'created')]);
  });

  it('keeps the order in which each path first changed', () => {
    expect(
      coalesceChanges([change('b', 'changed'), change('a', 'created'), change('b', 'changed')]),
    ).toEqual([change('b', 'changed'), change('a', 'created')]);
  });
});

describe('a subfolder of a watched folder — B-21', () => {
  it.each([
    ['', 'src/a.ts', 'src/a.ts'],
    ['pkg', 'pkg/x.ts', 'x.ts'],
    ['pkg', 'pkg', ''],
    ['pkg', 'pkgs/x.ts', null],
    ['pkg', 'other/x.ts', null],
    ['/r/app', '/r/app/pkg', 'pkg'],
    ['/r/app', '/r/application', null],
  ])('under %s, %s is %s', (prefix, path, relative) => {
    expect(relativeTo(prefix, path)).toBe(relative);
  });

  it.each([
    ['', 'pkg', true],
    ['pkg', 'pkg', true],
    ['pkg', 'pkg/deep', true],
    ['pkg/deep', 'pkg', false],
    ['pk', 'pkg', false],
    ['other', '', false],
    ['', '', true],
  ])('deleting %s takes %s away: %s', (deleted, prefix, gone) => {
    expect(takesAway(deleted, prefix)).toBe(gone);
  });
});

describe('the ceiling of one event — S-133', () => {
  const three = [change('a', 'created'), change('b', 'created'), change('c', 'created')];

  it('carries everything up to the ceiling', () => {
    expect(batchOf(three, 3)).toEqual({ changes: three, overflow: false });
  });

  it('cuts at the ceiling and says it overflowed', () => {
    expect(batchOf(three, 2)).toEqual({ changes: three.slice(0, 2), overflow: true });
  });
});
