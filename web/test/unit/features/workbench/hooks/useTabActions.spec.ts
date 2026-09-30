import { describe, expect, it, vi } from 'vitest';

import { tabActionsOf } from '@/features/workbench/hooks/useTabActions';
import type { FolderTab } from '@/features/workbench';

const tab = (path: string, kept = true): FolderTab => ({
  path,
  name: path.slice(1),
  rootLabel: 'Projects',
  state: 'available',
  kept,
});

function control(tabs: readonly FolderTab[]) {
  return { tabs, askClose: vi.fn(), move: vi.fn() };
}

const byId = (actions: ReturnType<typeof tabActionsOf>) =>
  Object.fromEntries(actions.map((action) => [action.id, action]));

describe('what a folder tab’s menu offers — plan 06, S-106, S-110', () => {
  it('offers the same six things, in the same order, for every tab', () => {
    const tabs = [tab('/a'), tab('/b')];

    expect(tabActionsOf(tabs[0]!, control(tabs), vi.fn()).map((action) => action.id)).toEqual([
      'close',
      'closeOthers',
      'closeRight',
      'moveLeft',
      'moveRight',
      'copyPath',
    ]);
  });

  it('closes this one, the others, or the ones to its right', () => {
    const tabs = [tab('/a'), tab('/b'), tab('/c')];
    const owner = control(tabs);
    const actions = byId(tabActionsOf(tabs[1]!, owner, vi.fn()));

    actions['close']?.run();
    actions['closeOthers']?.run();
    actions['closeRight']?.run();

    expect(owner.askClose.mock.calls).toEqual([[['/b']], [['/a', '/c']], [['/c']]]);
  });

  it('moves one place left or right, and copies the path', () => {
    const tabs = [tab('/a'), tab('/b'), tab('/c')];
    const owner = control(tabs);
    const copy = vi.fn();
    const actions = byId(tabActionsOf(tabs[1]!, owner, copy));

    actions['moveLeft']?.run();
    actions['moveRight']?.run();
    actions['copyPath']?.run();

    expect(owner.move.mock.calls).toEqual([
      ['/b', -1],
      ['/b', 1],
    ]);
    expect(copy).toHaveBeenCalledWith('/b');
  });

  it('offers nothing it cannot do: no others to close, no place to move to', () => {
    const only = [tab('/a')];
    const actions = byId(tabActionsOf(only[0]!, control(only), vi.fn()));

    expect(actions['closeOthers']?.disabled).toBe(true);
    expect(actions['closeRight']?.disabled).toBe(true);
    expect(actions['moveLeft']?.disabled).toBe(true);
    expect(actions['moveRight']?.disabled).toBe(true);
    expect(actions['close']?.disabled).toBe(false);
  });

  it('does not move a tab the server does not keep — it has no place in the order', () => {
    const tabs = [tab('/a'), tab('/new', false)];
    const actions = byId(tabActionsOf(tabs[1]!, control(tabs), vi.fn()));

    expect(actions['moveLeft']?.disabled).toBe(true);
    expect(actions['moveRight']?.disabled).toBe(true);
  });
});
