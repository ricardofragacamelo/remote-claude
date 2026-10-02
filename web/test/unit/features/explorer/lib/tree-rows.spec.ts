import { describe, expect, it } from 'vitest';

import { treeRowsOf } from '@/features/explorer/lib/tree-rows';
import type { DirectoryState, TreeSource } from '@/features/explorer/lib/tree-rows';
import type { TreeEntry } from '@/features/explorer/types/explorer';
import { AppError } from '@/shared/api/errors';

function anEntry(path: string, extra: Partial<TreeEntry> = {}): TreeEntry {
  return {
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    kind: 'file',
    size: 0,
    mtime: '2026-09-30T12:00:00.000Z',
    hidden: false,
    unreadableName: false,
    outside: false,
    targetKind: null,
    ...extra,
  };
}

const folder = (path: string, extra: Partial<TreeEntry> = {}): TreeEntry =>
  anEntry(path, { kind: 'directory', ...extra });

function sourceOf(
  levels: Readonly<Record<string, DirectoryState>>,
  extra: Partial<TreeSource> = {},
): TreeSource {
  return {
    directory: (path) => levels[path] ?? { status: 'loading' },
    expanded: new Set(['']),
    showHidden: false,
    sort: 'name',
    filter: '',
    compact: true,
    creating: null,
    renaming: null,
    ...extra,
  };
}

const ready = (path: string, entries: TreeEntry[], truncated = false): DirectoryState => ({
  status: 'ready',
  listing: { path, entries, truncated },
});

function labels(source: TreeSource): string[] {
  return treeRowsOf(source).rows.map((row) =>
    row.type === 'entry'
      ? `${String(row.level)}:${row.names.join('/')}`
      : `${String(row.level)}:${row.type}`,
  );
}

describe('the rows of the tree', () => {
  it('waits for the folder itself, and says when it failed', () => {
    expect(labels(sourceOf({}))).toEqual(['1:loading']);
    const error = new AppError('X', 'x', 't');
    const rows = treeRowsOf(sourceOf({ '': { status: 'error', error } })).rows;
    expect(rows).toEqual([expect.objectContaining({ type: 'error', error, parent: '' })]);
  });

  it('places each row among its siblings, and asks for the levels of the open folders', () => {
    const source = sourceOf(
      {
        '': ready('', [anEntry('b.ts'), folder('src'), anEntry('a.ts')]),
        src: ready('src', [anEntry('src/x.ts'), anEntry('src/y.ts')]),
      },
      { expanded: new Set(['', 'src']) },
    );
    const { rows, wanted } = treeRowsOf(source);

    expect(labels(source)).toEqual(['1:src', '2:x.ts', '2:y.ts', '1:a.ts', '1:b.ts']);
    expect(rows[0]).toMatchObject({ setSize: 3, posInSet: 1, expandable: true, expanded: true });
    expect(rows[2]).toMatchObject({ setSize: 2, posInSet: 2, parent: 'src' });
    expect(wanted).toEqual(['', 'src']);
  });

  it('compacts single folders, and stops at a level not read, a file, or a cut level — S-164', () => {
    const levels = {
      '': ready('', [folder('a'), folder('t')]),
      a: ready('a', [folder('a/b')]),
      'a/b': ready('a/b', [folder('a/b/c')]),
      'a/b/c': ready('a/b/c', [anEntry('a/b/c/x.ts')]),
      t: ready('t', [folder('t/u')], true),
    };
    const source = sourceOf(levels, { expanded: new Set(['', 'a', 't']) });

    expect(labels(source)).toEqual(['1:a/b/c', '2:x.ts', '1:t', '2:u', '2:truncated']);
    expect(treeRowsOf(source).wanted).toEqual(['', 'a', 'a/b', 'a/b/c', 't']);
    expect(labels(sourceOf(levels, { expanded: new Set(['', 'a']), compact: false }))).toEqual([
      '1:a',
      '2:b',
      '1:t',
    ]);
    expect(
      labels(sourceOf({ '': ready('', [folder('a')]) }, { expanded: new Set(['', 'a']) })),
    ).toEqual(['1:a', '2:loading']);
  });

  it('leaves hidden entries out, unless shown — S-166', () => {
    const levels = { '': ready('', [anEntry('.git', { hidden: true }), anEntry('a.ts')]) };

    expect(labels(sourceOf(levels))).toEqual(['1:a.ts']);
    expect(labels(sourceOf(levels, { showHidden: true }))).toEqual(['1:.git', '1:a.ts']);
  });

  it('a hidden folder does not stop a chain from compacting through it when it is hidden', () => {
    const levels = {
      '': ready('', [folder('a')]),
      a: ready('a', [folder('a/b'), anEntry('a/.DS_Store', { hidden: true })]),
      'a/b': ready('a/b', [anEntry('a/b/x.ts')]),
    };

    expect(labels(sourceOf(levels, { expanded: new Set(['', 'a']) }))).toEqual(['1:a/b', '2:x.ts']);
  });

  it('keeps what matches the filter and the folders read that lead to it — S-165', () => {
    const levels = {
      '': ready('', [folder('src'), folder('docs'), anEntry('needle.md')]),
      src: ready('src', [anEntry('src/Needle.ts'), anEntry('src/hay.ts'), folder('src/x')]),
    };

    expect(
      labels(
        sourceOf(levels, { expanded: new Set(['', 'src']), filter: ' needle ', compact: false }),
      ),
    ).toEqual(['1:src', '2:Needle.ts', '1:needle.md']);
  });

  it('puts the name being typed at the top of its folder, and marks the one renamed', () => {
    const levels = { '': ready('', [anEntry('a.ts')]) };
    const rows = treeRowsOf(
      sourceOf(levels, { creating: { parent: '', kind: 'directory' }, renaming: 'a.ts' }),
    ).rows;

    expect(rows[0]).toMatchObject({ type: 'creating', kind: 'directory' });
    expect(rows[1]).toMatchObject({ type: 'entry', renaming: true });
  });
});
