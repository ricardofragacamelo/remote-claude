import { describe, expect, it } from 'vitest';

import { captureEditor, keptEditorFrom, layoutFrom } from '@/features/editor/lib/kept-editor';
import { aDiffTab, aFileTab, emptyLayout, openIn } from '@/features/editor/lib/layout';

const disk = (path: string) => ({ path, source: 'disk' as const });

describe('what a reload keeps of an editor — plan 07, S-216', () => {
  it('is paths only: the groups, their tabs, the one on screen, and the files opened last', () => {
    let layout = openIn(emptyLayout(), aFileTab('a.ts', false), false);
    layout = openIn(layout, aFileTab('b.ts', true), false);
    layout = openIn(layout, aFileTab('a.ts', false), true);
    layout = openIn(layout, aDiffTab(disk('a.ts'), disk('b.ts')), false);
    layout = openIn(layout, aDiffTab(disk('a.ts'), { path: 'a.ts', source: 'buffer' }), false);

    const kept = captureEditor({ ...layout, recent: ['a.ts', 'b.ts'] });

    expect(kept).toEqual({
      groups: [
        {
          tabs: [
            { kind: 'file', path: 'a.ts', preview: false, pinned: false },
            { kind: 'file', path: 'b.ts', preview: true, pinned: false },
          ],
          active: 1,
        },
        {
          tabs: [
            { kind: 'file', path: 'a.ts', preview: false, pinned: false },
            { kind: 'diff', left: disk('a.ts'), right: disk('b.ts'), pinned: false },
          ],
          // The diff of a buffer has nothing to show after a reload, and is not kept.
          active: null,
        },
      ],
      activeGroup: 1,
      recent: ['a.ts', 'b.ts'],
    });
    expect(JSON.stringify(kept)).not.toContain('content');
  });

  it('comes back as the same tabs, in new groups', () => {
    const layout = layoutFrom({
      groups: [
        { tabs: [{ kind: 'file', path: 'a', preview: false, pinned: true }], active: 0 },
        { tabs: [], active: null },
        {
          tabs: [{ kind: 'diff', left: disk('a'), right: disk('b'), pinned: false }],
          active: null,
        },
      ],
      activeGroup: 1,
      recent: [],
    });

    expect(layout.groups.map((group) => group.tabs.map((tab) => tab.id))).toEqual([
      ['file:a'],
      ['diff:disk:a|disk:b'],
    ]);
    expect(layout.groups[0]?.tabs[0]?.pinned).toBe(true);
    expect(layout.groups[1]?.active).toBe('diff:disk:a|disk:b');
    expect(layout.activeGroup).toBe(layout.groups[1]?.id);
  });

  it('is an empty editor when nothing was kept, and the first group when the focus is stale', () => {
    expect(layoutFrom({ groups: [], activeGroup: 0, recent: [] }).groups).toHaveLength(1);

    const layout = layoutFrom({
      groups: [{ tabs: [{ kind: 'file', path: 'a', preview: false, pinned: false }], active: 0 }],
      activeGroup: 7,
      recent: [],
    });
    expect(layout.activeGroup).toBe(layout.groups[0]?.id);
  });

  it('trusts only what reads as one — a tab or a group that does not is left out', () => {
    expect(keptEditorFrom(null)).toBeUndefined();
    expect(keptEditorFrom({ groups: 'no' })).toBeUndefined();

    expect(
      keptEditorFrom({
        groups: [
          'junk',
          { tabs: 'no' },
          {
            tabs: [
              { kind: 'file', path: 'a', preview: false, pinned: false },
              { kind: 'file', path: 1, preview: false, pinned: false },
              {
                kind: 'diff',
                left: disk('a'),
                right: { path: 'b', source: 'cloud' },
                pinned: false,
              },
              { kind: 'diff', left: disk('a'), right: disk('b'), pinned: true },
              { kind: 'what', pinned: false },
              { kind: 'file', path: 'c', preview: false },
            ],
            active: 9,
          },
        ],
        activeGroup: 'x',
        recent: ['a', 2],
      }),
    ).toEqual({
      groups: [
        {
          tabs: [
            { kind: 'file', path: 'a', preview: false, pinned: false },
            { kind: 'diff', left: disk('a'), right: disk('b'), pinned: true },
          ],
          active: null,
        },
      ],
      activeGroup: 0,
      recent: ['a'],
    });

    expect(keptEditorFrom({ groups: [{ tabs: [], active: 0 }] })).toEqual({
      groups: [{ tabs: [], active: null }],
      activeGroup: 0,
      recent: [],
    });
  });
});
