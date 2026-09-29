import { describe, expect, it } from 'vitest';

import {
  decideOpening,
  OPEN_FOLDERS_LIMIT,
  OpenFoldersLimitReachedError,
  OpenFoldersOrderConflictError,
  orderRecent,
  orderTabs,
  RECENT_FOLDERS_LIMIT,
  recentBeyondLimit,
  reorderTabs,
  WorkspacePath,
} from '@domain/workspace';
import { aFolder, minutesAfter } from '../../../../support/builders/workspace-folder.builder';

const at = (path: string) => WorkspacePath.create(path);
const paths = (folders: readonly { path: WorkspacePath }[]) => folders.map((f) => f.path.value);

describe('decideOpening', () => {
  it('puts the first tab at position zero', () => {
    expect(decideOpening([], at('/srv/projects/app'), 8)).toEqual({
      alreadyOpen: false,
      position: 0,
    });
  });

  it('puts a new tab after the last one, whatever gaps closing left', () => {
    const folders = [
      aFolder({ path: '/srv/projects/a', tabPosition: 0 }),
      aFolder({ path: '/srv/projects/b', tabPosition: 4 }),
    ];

    expect(decideOpening(folders, at('/srv/projects/c'), 8).position).toBe(5);
  });

  it('answers the tab already open, without a second one — plan 06, S-41', () => {
    const folders = [aFolder({ path: '/srv/projects/app', tabPosition: 3 })];

    expect(decideOpening(folders, at('/srv/projects/app'), 8)).toEqual({
      alreadyOpen: true,
      position: 3,
    });
  });

  it('opens a recent folder whose tab is closed as a new tab', () => {
    const folders = [aFolder({ path: '/srv/projects/app', tabPosition: null })];

    expect(decideOpening(folders, at('/srv/projects/app'), 8).alreadyOpen).toBe(false);
  });

  it('refuses a new tab with the ceiling reached — plan 06, S-43', () => {
    const open = [0, 1].map((position) =>
      aFolder({ path: `/srv/projects/${String(position)}`, tabPosition: position }),
    );

    expect(() => decideOpening(open, at('/srv/projects/new'), 2)).toThrow(
      OpenFoldersLimitReachedError,
    );
  });

  it('still answers a folder already open when the ceiling is reached', () => {
    const open = [0, 1].map((position) =>
      aFolder({ path: `/srv/projects/${String(position)}`, tabPosition: position }),
    );

    expect(decideOpening(open, at('/srv/projects/1'), 2).alreadyOpen).toBe(true);
  });

  it('counts only open tabs against the ceiling', () => {
    const folders = [
      aFolder({ path: '/srv/projects/open', tabPosition: 0 }),
      aFolder({ path: '/srv/projects/closed', tabPosition: null }),
    ];

    expect(decideOpening(folders, at('/srv/projects/new'), 2).position).toBe(1);
  });

  it('says the ceiling in the refusal', () => {
    let refusal: unknown;

    try {
      decideOpening([aFolder({ tabPosition: 0 })], at('/srv/projects/new'), 1);
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toBeInstanceOf(OpenFoldersLimitReachedError);
    expect((refusal as OpenFoldersLimitReachedError).params).toEqual({ limit: 1 });
  });

  it('holds eight tabs', () => {
    expect(OPEN_FOLDERS_LIMIT).toBe(8);
  });
});

describe('orderRecent — plan 06, S-34', () => {
  it('puts the pinned first, then the most recently opened', () => {
    const folders = [
      aFolder({ path: '/srv/projects/old', lastOpenedAt: minutesAfter(0) }),
      aFolder({ path: '/srv/projects/new', lastOpenedAt: minutesAfter(10) }),
      aFolder({ path: '/srv/projects/pinned', lastOpenedAt: minutesAfter(-100), pinned: true }),
    ];

    expect(paths(orderRecent(folders).map((recent) => recent.folder))).toEqual([
      '/srv/projects/pinned',
      '/srv/projects/new',
      '/srv/projects/old',
    ]);
  });

  it('orders the pinned among themselves by recency too', () => {
    const folders = [
      aFolder({ path: '/srv/projects/a', pinned: true, lastOpenedAt: minutesAfter(1) }),
      aFolder({ path: '/srv/projects/b', pinned: true, lastOpenedAt: minutesAfter(2) }),
    ];

    expect(paths(orderRecent(folders).map((recent) => recent.folder))).toEqual([
      '/srv/projects/b',
      '/srv/projects/a',
    ]);
  });

  it('breaks a tie on the instant by the path, so the order is fixed', () => {
    const tied = [aFolder({ path: '/srv/projects/b' }), aFolder({ path: '/srv/projects/a' })];

    expect(paths(orderRecent(tied).map((recent) => recent.folder))).toEqual([
      '/srv/projects/a',
      '/srv/projects/b',
    ]);
    expect(paths(orderRecent([...tied].reverse()).map((recent) => recent.folder))).toEqual([
      '/srv/projects/a',
      '/srv/projects/b',
    ]);
  });

  it('leaves out a folder taken off the list while its tab is open', () => {
    const folders = [aFolder({ lastOpenedAt: null, tabPosition: 0 })];

    expect(orderRecent(folders)).toEqual([]);
  });

  it('answers the instant that puts each folder on the list', () => {
    const [recent] = orderRecent([aFolder({ lastOpenedAt: minutesAfter(5) })]);

    expect(recent?.lastOpenedAt).toEqual(minutesAfter(5));
  });
});

describe('recentBeyondLimit — plan 06, S-38', () => {
  const unpinned = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      aFolder({ path: `/srv/projects/${String(index)}`, lastOpenedAt: minutesAfter(index) }),
    );

  it('lets go of nothing up to the ceiling', () => {
    expect(recentBeyondLimit(unpinned(3), 3)).toEqual([]);
  });

  it('lets go of the oldest unpinned past the ceiling', () => {
    expect(paths(recentBeyondLimit(unpinned(4), 3))).toEqual(['/srv/projects/0']);
  });

  it('never lets go of a pinned folder, however old, nor counts it', () => {
    const folders = [
      ...unpinned(3),
      aFolder({ path: '/srv/projects/pinned', pinned: true, lastOpenedAt: minutesAfter(-1_000) }),
    ];

    expect(recentBeyondLimit(folders, 3)).toEqual([]);
  });

  it('never lets go of a folder whose tab is open', () => {
    const folders = [
      aFolder({ path: '/srv/projects/open', lastOpenedAt: minutesAfter(-1_000), tabPosition: 0 }),
      ...unpinned(3),
    ];

    expect(recentBeyondLimit(folders, 3)).toEqual([]);
  });

  it('keeps twenty', () => {
    expect(RECENT_FOLDERS_LIMIT).toBe(20);
  });
});

describe('orderTabs', () => {
  it('answers the open tabs by position, and only them', () => {
    const folders = [
      aFolder({ path: '/srv/projects/b', tabPosition: 2 }),
      aFolder({ path: '/srv/projects/closed', tabPosition: null }),
      aFolder({ path: '/srv/projects/a', tabPosition: 1 }),
    ];

    expect(paths(orderTabs(folders))).toEqual(['/srv/projects/a', '/srv/projects/b']);
  });
});

describe('reorderTabs — plan 06, S-44', () => {
  const open = [
    aFolder({ path: '/srv/projects/a', tabPosition: 0 }),
    aFolder({ path: '/srv/projects/b', tabPosition: 1 }),
    aFolder({ path: '/srv/projects/closed', tabPosition: null }),
  ];

  it('gives each open tab its place in the new order', () => {
    const positions = reorderTabs(open, [at('/srv/projects/b'), at('/srv/projects/a')]);

    expect([...positions]).toEqual([
      ['/srv/projects/b', 0],
      ['/srv/projects/a', 1],
    ]);
  });

  it.each([
    ['one tab missing', ['/srv/projects/a']],
    ['one tab more', ['/srv/projects/a', '/srv/projects/b', '/srv/projects/c']],
    ['a closed folder in place of an open one', ['/srv/projects/a', '/srv/projects/closed']],
    ['a tab named twice', ['/srv/projects/a', '/srv/projects/a']],
  ])('refuses an order with %s', (_case, requested) => {
    expect(() =>
      reorderTabs(
        open,
        requested.map((path) => at(path)),
      ),
    ).toThrow(OpenFoldersOrderConflictError);
  });

  it('refuses with a conflict, not a validation failure', () => {
    const error = new OpenFoldersOrderConflictError(1, 2);

    expect(error.code).toBe('CONFLICT');
    expect(error.messageKey).toBe('workspace.error.openFoldersOrderConflict');
  });
});
