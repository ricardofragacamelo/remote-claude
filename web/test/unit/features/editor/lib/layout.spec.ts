import { describe, expect, it } from 'vitest';

import {
  MAX_GROUPS,
  aDiffTab,
  aFileTab,
  aGroup,
  activeGroupOf,
  activeTabOf,
  emptyLayout,
  isShown,
  mapTabs,
  movedAcross,
  movedTo,
  openIn,
  openPaths,
  withTab,
  withoutTabs,
} from '@/features/editor/lib/layout';
import type { Layout } from '@/features/editor/lib/layout';

const disk = (path: string) => ({ path, source: 'disk' as const });
const buffer = (path: string) => ({ path, source: 'buffer' as const });

/** The id of a group, which a test knows is there. */
function groupId(layout: Layout, index: number): string {
  return layout.groups[index]?.id ?? 'missing';
}

function ids(layout: Layout, index = 0): string[] {
  return layout.groups[index]?.tabs.map((tab) => tab.id) ?? [];
}

describe('opening a tab in a group — plan 07, S-209, S-214', () => {
  it('puts it after the tab on screen, and on screen', () => {
    const group = withTab(withTab(aGroup(), aFileTab('a', false)), aFileTab('b', false));
    const back = withTab({ ...group, active: 'file:a' }, aFileTab('c', false));

    expect(back.tabs.map((tab) => tab.id)).toEqual(['file:a', 'file:c', 'file:b']);
    expect(back.active).toBe('file:c');
  });

  it('replaces the preview with the next preview, keeping its place', () => {
    const group = withTab(withTab(aGroup(), aFileTab('a', false)), aFileTab('b', true));
    const next = withTab(group, aFileTab('c', true));

    expect(next.tabs.map((tab) => [tab.id, tab.preview])).toEqual([
      ['file:a', false],
      ['file:c', true],
    ]);
  });

  it('focuses the tab that has the file, and keeps a preview opened for real', () => {
    const group = withTab(withTab(aGroup(), aFileTab('a', true)), aFileTab('b', false));
    const again = withTab(group, aFileTab('a', true));
    const kept = withTab(group, aFileTab('a', false));

    expect(again.tabs).toHaveLength(2);
    expect(again.active).toBe('file:a');
    expect(again.tabs[0]?.preview).toBe(true);
    expect(kept.tabs[0]?.preview).toBe(false);
  });
});

describe('groups side by side — plan 07, S-221, S-223', () => {
  it('opens to the side in a new group, and a third, then the last one', () => {
    let layout = openIn(emptyLayout(), aFileTab('a', false), false);
    layout = openIn(layout, aFileTab('a', false), true);
    expect(layout.groups).toHaveLength(2);
    expect(activeGroupOf(layout)).toBe(layout.groups[1]);

    layout = openIn(layout, aFileTab('b', false), true);
    expect(layout.groups).toHaveLength(MAX_GROUPS);
    layout = openIn(layout, aFileTab('c', false), true);
    expect(layout.groups).toHaveLength(MAX_GROUPS);
    expect(ids(layout, 2)).toEqual(['file:b', 'file:c']);
  });

  it('opens to the side into the group already there', () => {
    let layout = openIn(emptyLayout(), aFileTab('a', false), false);
    layout = openIn(layout, aFileTab('b', false), true);
    layout = { ...layout, activeGroup: layout.groups[0]?.id ?? '' };
    layout = openIn(layout, aFileTab('c', false), true);

    expect(layout.groups).toHaveLength(2);
    expect(ids(layout, 1)).toEqual(['file:b', 'file:c']);
  });

  it('closes a group with its last tab, unless it is the only one', () => {
    let layout = openIn(emptyLayout(), aFileTab('a', false), false);
    layout = openIn(layout, aFileTab('b', false), true);
    const second = layout.groups[1]?.id ?? 'missing';

    const one = withoutTabs(layout, second, ['file:b']);
    expect(one.groups).toHaveLength(1);
    expect(one.activeGroup).toBe(one.groups[0]?.id);

    const empty = withoutTabs(one, one.groups[0]?.id ?? '', ['file:a']);
    expect(empty.groups).toHaveLength(1);
    expect(empty.groups[0]?.active).toBeNull();
    expect(withoutTabs(empty, 'nope', ['x'])).toBe(empty);
  });

  it('keeps the focus where it was when another group closes', () => {
    let layout = openIn(emptyLayout(), aFileTab('a', false), false);
    layout = openIn(layout, aFileTab('b', false), true);
    const [first, second] = layout.groups;
    const focused = { ...layout, activeGroup: first?.id ?? '' };

    expect(withoutTabs(focused, second?.id ?? '', ['file:b']).activeGroup).toBe(first?.id);
  });

  it('puts the neighbour on screen when the active tab closes — the right one, else the left', () => {
    const group = withTab(
      withTab(withTab(aGroup(), aFileTab('a', false)), aFileTab('b', false)),
      aFileTab('c', false),
    );
    const layout = { groups: [{ ...group, active: 'file:b' }], activeGroup: group.id };

    expect(withoutTabs(layout, group.id, ['file:b']).groups[0]?.active).toBe('file:c');
    expect(
      withoutTabs({ ...layout, groups: [{ ...group, active: 'file:c' }] }, group.id, ['file:c'])
        .groups[0]?.active,
    ).toBe('file:b');
    expect(withoutTabs(layout, group.id, ['file:a']).groups[0]?.active).toBe('file:b');
  });

  it('moves a tab across groups, and the group it left closes when empty', () => {
    let layout = openIn(emptyLayout(), aFileTab('a', false), false);
    layout = openIn(layout, aFileTab('b', false), true);
    const first = groupId(layout, 0);
    const second = groupId(layout, 1);
    const moved = movedAcross(layout, second, 'file:b', first, 0);

    expect(moved.groups).toHaveLength(1);
    expect(ids(moved)).toEqual(['file:b', 'file:a']);
    expect(moved.activeGroup).toBe(first);
    expect(movedAcross(layout, first, 'file:x', second, 0)).toBe(layout);
    expect(movedAcross(layout, first, 'file:a', first, 0)).toBe(layout);
  });
});

describe('the place of a tab — plan 07, S-213', () => {
  it('moves to an index, clamped; pinned tabs stay at the left', () => {
    const group = [aFileTab('a', false), aFileTab('b', false), aFileTab('c', false)].reduce(
      withTab,
      aGroup(),
    );

    expect(movedTo(group, 'file:c', 0).tabs.map((tab) => tab.id)).toEqual([
      'file:c',
      'file:a',
      'file:b',
    ]);
    expect(movedTo(group, 'file:a', 99).tabs.map((tab) => tab.id)).toEqual([
      'file:b',
      'file:c',
      'file:a',
    ]);
    expect(movedTo(group, 'file:x', 0)).toBe(group);

    const pinned = {
      ...group,
      tabs: group.tabs.map((tab) => (tab.id === 'file:b' ? { ...tab, pinned: true } : tab)),
    };
    expect(movedTo(pinned, 'file:a', 0).tabs.map((tab) => tab.id)).toEqual([
      'file:b',
      'file:a',
      'file:c',
    ]);
  });

  it('follows a change of every tab — the one on screen included', () => {
    const layout = openIn(emptyLayout(), aFileTab('a', false), false);
    const renamed = mapTabs(
      layout,
      () => true,
      (tab) => ({ ...tab, id: 'file:z' }),
    );

    expect(renamed.groups[0]?.active).toBe('file:z');
  });
});

describe('what a layout shows', () => {
  it('names each open file once, and knows a buffer side of a diff shows a file', () => {
    let layout = openIn(emptyLayout(), aFileTab('a', false), false);
    layout = openIn(layout, aFileTab('a', false), true);
    layout = openIn(layout, aDiffTab(disk('b'), buffer('c')), false);

    expect(openPaths(layout)).toEqual(['a']);
    expect(isShown(layout, 'a')).toBe(true);
    expect(isShown(layout, 'c')).toBe(true);
    expect(isShown(layout, 'b')).toBe(false);
    expect(activeTabOf(activeGroupOf(layout))?.kind).toBe('diff');
  });

  it('falls back to the first group when the focus names none', () => {
    const layout = emptyLayout();
    expect(activeGroupOf({ ...layout, activeGroup: 'gone' })).toBe(layout.groups[0]);
  });
});
