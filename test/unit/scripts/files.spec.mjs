import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { filesUnder } from '../../../scripts/lib/files.mjs';

/** @type {string[]} */
const created = [];

/** @param {Record<string, string>} tree */
function treeWith(tree) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-files-'));
  created.push(root);

  for (const [relative, contents] of Object.entries(tree)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }

  return root;
}

afterEach(() => {
  for (const root of created.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('filesUnder', () => {
  it('finds the files with the extensions asked for, at any depth', () => {
    const root = treeWith({ 'a.ts': '', 'deep/b.ts': '', 'deep/c.md': '' });

    expect(
      filesUnder(root, ['.ts'])
        .map((file) => path.relative(root, file))
        .sort(),
    ).toEqual(['a.ts', path.join('deep', 'b.ts')]);
  });

  it('never descends into what is not source', () => {
    const root = treeWith({ 'node_modules/pkg/a.ts': '', 'dist/b.ts': '', 'coverage/c.ts': '' });

    expect(filesUnder(root, ['.ts'])).toEqual([]);
  });

  it('leaves out the directories the caller names as well', () => {
    const root = treeWith({ 'generated/a.dart': '', 'b.dart': '' });

    expect(filesUnder(root, ['.dart'], (name) => name === 'generated')).toHaveLength(1);
  });

  it('answers nothing for a directory that does not exist', () => {
    expect(filesUnder(path.join(os.tmpdir(), 'rc-no-such-directory'), ['.ts'])).toEqual([]);
  });
});
