import { afterEach, describe, expect, it, vi } from 'vitest';

import { tabMenuOf } from '@/features/editor/hooks/tab-menu';
import { openDiff, openFile } from '@/features/editor/hooks/tabs';
import { claudeContextTargets } from '@/shared/lib/files-drag';
import { FOLDER, editorState, openedModel } from '../../../../support/editor';
import { fakeDisk } from '../../../../support/editor-disk';

afterEach(() => {
  vi.restoreAllMocks();
});

const group = () => editorState().groups[0]?.id ?? 'missing';
const tab = (index: number) => {
  const found = editorState().groups[0]?.tabs[index];
  if (found === undefined) throw new Error('no tab there');
  return found;
};

function menu(
  index: number,
  extra: { dirty?: boolean; claude?: boolean; reveal?: (() => void) | null } = {},
) {
  return tabMenuOf(tab(index), {
    folder: FOLDER,
    group: group(),
    dirty: extra.dirty ?? false,
    claude: extra.claude ?? false,
    reveal: extra.reveal ?? null,
  });
}

/** The action of a menu with that id — which the test knows is there. */
function pick(sections: ReturnType<typeof menu>, id: string) {
  const found = sections.flat().find((action) => action.id === id);
  if (found === undefined) throw new Error(`no ${id} in the menu`);
  return found;
}

const ids = (sections: ReturnType<typeof menu>) =>
  sections.map((section) => section.map((action) => action.id));

describe('the menu of an editor tab — plan 07, B-32', () => {
  it('closes, pins, moves, opens to the side and compares — each where it can', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    await openedModel('a.ts');
    await openedModel('b.ts');

    const sections = menu(0);
    expect(ids(sections)).toEqual([
      ['close', 'closeOthers', 'closeRight', 'closeSaved', 'closeAll'],
      ['pin', 'moveLeft', 'moveRight'],
      ['openToSide', 'compareWithSaved'],
    ]);
    const disabled = Object.fromEntries(
      sections.flat().map((action) => [action.id, action.disabled]),
    );
    expect(disabled).toMatchObject({
      moveLeft: true,
      moveRight: false,
      compareWithSaved: true,
      closeRight: false,
    });

    pick(sections, 'moveRight').run();
    expect(editorState().groups[0]?.tabs.map((each) => each.id)).toEqual([
      'file:b.ts',
      'file:a.ts',
    ]);
    pick(menu(1), 'moveLeft').run();
    pick(menu(0), 'pin').run();
    expect(tab(0).pinned).toBe(true);
    expect(pick(menu(0), 'pin').labelKey).toBe('editor.tabMenu.unpin');
    pick(menu(0), 'pin').run();

    pick(menu(0, { dirty: true }), 'compareWithSaved').run();
    expect(editorState().groups[0]?.tabs.map((each) => each.id)).toContain(
      'diff:disk:a.ts|buffer:a.ts',
    );
    pick(menu(0), 'openToSide').run();
    expect(editorState().groups).toHaveLength(2);
  });

  it('closes from each item of its first section', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' });
    for (const path of ['a.ts', 'b.ts', 'c.ts']) openFile(FOLDER, path);

    pick(menu(0), 'closeRight').run();
    expect(editorState().groups[0]?.tabs).toHaveLength(1);
    openFile(FOLDER, 'b.ts');
    pick(menu(0), 'closeOthers').run();
    pick(menu(0), 'closeSaved').run();
    openFile(FOLDER, 'c.ts');
    pick(menu(0), 'closeAll').run();
    expect(editorState().groups[0]?.tabs).toEqual([]);
    openFile(FOLDER, 'a.ts');
    pick(menu(0), 'close').run();
    expect(editorState().groups[0]?.tabs).toEqual([]);
  });

  it('reveals in the explorer and adds to Claude’s context only when somebody does them (S-276)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    await openedModel('a.ts');
    const reveal = vi.fn();
    const add = vi.fn();
    const unregister = claudeContextTargets.register({ id: 'chat', position: 1, add });

    const sections = menu(0, { claude: true, reveal });
    expect(ids(sections)[2]).toEqual(['openToSide', 'compareWithSaved', 'reveal', 'addToClaude']);
    pick(sections, 'reveal').run();
    pick(sections, 'addToClaude').run();

    expect(reveal).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith({ folder: FOLDER, entries: [{ path: 'a.ts', kind: 'file' }] });
    unregister();
  });

  it('has no file section for a diff', () => {
    fakeDisk(FOLDER, {});
    openDiff(FOLDER, { path: 'a', source: 'disk' }, { path: 'b', source: 'disk' });

    expect(ids(menu(0))).toHaveLength(2);
  });
});
