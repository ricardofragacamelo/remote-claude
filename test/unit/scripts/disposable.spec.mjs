import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DISPOSABLE, findDisposable } from '../../../scripts/lib/disposable.mjs';

/** @type {string[]} */
const temporary = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** @param {readonly string[]} directories */
function treeWith(directories) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-clean-'));
  temporary.push(root);

  for (const relative of directories) {
    fs.mkdirSync(path.join(root, relative), { recursive: true });
  }

  return root;
}

describe('findDisposable', () => {
  it('finds a disposable directory at the root', () => {
    expect(findDisposable(treeWith(['dist']))).toEqual(['dist']);
  });

  it('finds them inside every workspace, not only at the root', () => {
    const root = treeWith(['backend/dist', 'web/coverage', 'mobile/.dart_tool']);

    expect(findDisposable(root).sort()).toEqual([
      'backend/dist',
      'mobile/.dart_tool',
      'web/coverage',
    ]);
  });

  it('covers every directory the catalogue promises to reclaim', () => {
    const root = treeWith(DISPOSABLE);

    expect(findDisposable(root).sort()).toEqual([...DISPOSABLE].sort());
  });

  it('never descends into node_modules — reinstalling is pnpm’s job, not this script’s', () => {
    const root = treeWith(['node_modules/some-package/dist', 'src']);

    expect(findDisposable(root)).toEqual([]);
  });

  it('never touches .git', () => {
    const root = treeWith(['.git/build']);

    expect(findDisposable(root)).toEqual([]);
  });

  it('does not descend into a directory it is going to remove whole', () => {
    const root = treeWith(['dist/coverage']);

    expect(findDisposable(root)).toEqual(['dist']);
  });

  it('finds nothing in a tree with nothing to reclaim — the second run of the script', () => {
    expect(findDisposable(treeWith(['src', 'docs']))).toEqual([]);
  });

  it('ignores a file that happens to share a disposable name', () => {
    const root = treeWith(['src']);
    fs.writeFileSync(path.join(root, 'dist'), '');

    expect(findDisposable(root)).toEqual([]);
  });
});
