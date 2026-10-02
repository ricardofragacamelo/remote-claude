import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { neighbourOf, useFollowFocus } from '@/features/explorer/hooks/useFollowFocus';
import type { TreeRow } from '@/features/explorer/lib/tree-rows';
import { explorerStore, forgetExplorer } from '@/features/explorer/store/explorer.store';
import { AppError } from '@/shared/api/errors';

const APP = '/srv/app';

afterEach(() => {
  forgetExplorer(null);
});

function entry(path: string): TreeRow {
  return {
    type: 'entry',
    key: path,
    path,
    head: path,
    entry: {
      name: path,
      path,
      kind: 'file',
      size: 0,
      mtime: '',
      hidden: false,
      unreadableName: false,
      outside: false,
      targetKind: null,
    },
    names: [path],
    parent: '',
    level: 1,
    setSize: 1,
    posInSet: 1,
    expandable: false,
    expanded: false,
    renaming: false,
  };
}

const loading: TreeRow = { type: 'loading', key: 'l', parent: '', level: 1 };
const failed: TreeRow = {
  type: 'error',
  key: 'e',
  parent: '',
  level: 1,
  error: new AppError('X', 'x', 't'),
};

describe('the neighbour of a row that went — S-189', () => {
  it('is the row now in its place, or the first one above that takes the focus', () => {
    expect(neighbourOf([entry('a'), entry('c')], 1)).toBe(1);
    expect(neighbourOf([entry('a'), loading], 1)).toBe(0);
    expect(neighbourOf([entry('a'), entry('b')], 5)).toBe(1);
    expect(neighbourOf([loading, failed], 0)).toBe(1);
    expect(neighbourOf([loading], 0)).toBe(-1);
  });

  it('selects nothing when no row is left to take the focus', () => {
    const tree = { current: null };
    explorerStore(APP).getState().select(['a'], 'a');
    const { rerender } = renderHook(({ rows }) => useFollowFocus(APP, rows, tree), {
      initialProps: { rows: [entry('a')] as readonly TreeRow[] },
    });

    act(() => {
      rerender({ rows: [loading] });
    });

    expect(explorerStore(APP).getState()).toMatchObject({ selection: [], focused: null });
  });
});
