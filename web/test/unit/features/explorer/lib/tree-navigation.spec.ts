import { describe, expect, it } from 'vitest';

import {
  edgeOf,
  entryRows,
  indexOfKey,
  isFocusable,
  labelOf,
  parentIndex,
  rangeOf,
  stepFrom,
  typeAhead,
} from '@/features/explorer/lib/tree-navigation';
import type { EntryRow, TreeRow } from '@/features/explorer/lib/tree-rows';
import { AppError } from '@/shared/api/errors';

function anEntryRow(path: string, parent = ''): EntryRow {
  return {
    type: 'entry',
    key: path,
    path,
    head: path,
    entry: {
      name: path.slice(path.lastIndexOf('/') + 1),
      path,
      kind: 'file',
      size: 0,
      mtime: '',
      hidden: false,
      unreadableName: false,
      outside: false,
      targetKind: null,
    },
    names: [path.slice(path.lastIndexOf('/') + 1)],
    parent,
    level: parent === '' ? 1 : 2,
    setSize: 1,
    posInSet: 1,
    expandable: false,
    expanded: false,
    renaming: false,
  };
}

const rows: TreeRow[] = [
  { type: 'loading', key: 'l', parent: '', level: 1 },
  anEntryRow('src'),
  anEntryRow('src/alpha.ts', 'src'),
  { type: 'error', key: 'e', parent: 'src', level: 2, error: new AppError('X', 'x', 't') },
  anEntryRow('beta.ts'),
  { type: 'truncated', key: 't', parent: '', level: 1 },
];

describe('moving through the rows — S-162', () => {
  it('stops on entries and failed levels only', () => {
    expect(rows.map(isFocusable)).toEqual([false, true, true, true, true, false]);
    expect(entryRows(rows).map((row) => row.path)).toEqual(['src', 'src/alpha.ts', 'beta.ts']);
  });

  it('steps up and down, staying put at either end, starting from nowhere at the edges', () => {
    expect(stepFrom(rows, 1, 1)).toBe(2);
    expect(stepFrom(rows, 2, 1)).toBe(3);
    expect(stepFrom(rows, 4, 1)).toBe(4);
    expect(stepFrom(rows, 1, -1)).toBe(1);
    expect(stepFrom(rows, -1, 1)).toBe(1);
    expect(stepFrom(rows, -1, -1)).toBe(4);
    expect(edgeOf(rows, 'first')).toBe(1);
    expect(edgeOf(rows, 'last')).toBe(4);
    expect(stepFrom([], -1, 1)).toBe(-1);
  });

  it('finds rows by key, and the folder a row is in', () => {
    expect(indexOfKey(rows, 'beta.ts')).toBe(4);
    expect(indexOfKey(rows, null)).toBe(-1);
    expect(parentIndex(rows, 2)).toBe(1);
    expect(parentIndex(rows, 4)).toBe(-1);
    expect(parentIndex(rows, 99)).toBe(-1);
  });

  it('finds a row by what is typed, around the end', () => {
    expect(labelOf(anEntryRow('src/alpha.ts'))).toBe('alpha.ts');
    expect(typeAhead(rows, 1, 'AL')).toBe(2);
    expect(typeAhead(rows, 4, 's')).toBe(1);
    expect(typeAhead(rows, 1, 'zzz')).toBe(1);
  });

  it('selects the entries between two rows, both ways', () => {
    expect(rangeOf(rows, 1, 4)).toEqual(['src', 'src/alpha.ts', 'beta.ts']);
    expect(rangeOf(rows, 4, 2)).toEqual(['src/alpha.ts', 'beta.ts']);
    expect(rangeOf(rows, -1, 2)).toEqual(['src', 'src/alpha.ts']);
  });
});
