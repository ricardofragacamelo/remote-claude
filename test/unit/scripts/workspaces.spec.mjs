import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ALLOWLIST_FILE,
  declaredRoots,
  ensureDeclaredRoots,
} from '../../../scripts/lib/workspaces.mjs';

/** @type {string[]} */
const temporary = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

/** A directory that is cleaned up when the test ends. */
function scratch() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-workspaces-'));
  temporary.push(directory);
  return directory;
}

/**
 * An allowlist file declaring the given roots.
 *
 * @param {readonly string[]} roots
 * @returns {string}
 */
function allowlist(roots) {
  const file = path.join(scratch(), 'allowlist.yaml');
  const body = roots
    .map(
      (/** @type {string} */ root) =>
        `  - path: ${root}\n    label: Scratch\n    users:\n      - auth|dev\n`,
    )
    .join('');

  fs.writeFileSync(file, `# a comment\nroots:\n${body}`, 'utf8');
  return file;
}

describe('the development allowlist', () => {
  it('points at the file the repository ships', () => {
    expect(ALLOWLIST_FILE.endsWith('/infra/workspace-allowlist.yaml')).toBe(true);
    expect(fs.existsSync(ALLOWLIST_FILE)).toBe(true);
  });

  it('reads the roots from the file rather than repeating them', () => {
    // A copy of the list here is a second source of truth, and the one that goes stale is always
    // the copy — the backend refuses to start on a root that is not there.
    expect(declaredRoots(allowlist(['/tmp/a', '/tmp/b']))).toEqual(['/tmp/a', '/tmp/b']);
  });

  it('ignores the comments the file exists to carry', () => {
    expect(declaredRoots(allowlist(['/tmp/a']))).toEqual(['/tmp/a']);
  });

  it('reads the shipped file without failing', () => {
    expect(declaredRoots().length).toBeGreaterThan(0);
  });

  it('answers nothing for a file that declares no roots', () => {
    const file = path.join(scratch(), 'empty.yaml');
    fs.writeFileSync(file, 'roots: []\n', 'utf8');

    expect(declaredRoots(file)).toEqual([]);
  });

  it('creates every root it declares', () => {
    const base = scratch();
    const roots = [path.join(base, 'one'), path.join(base, 'two')];

    expect(ensureDeclaredRoots(allowlist(roots))).toEqual(roots);
    expect(roots.every((root) => fs.statSync(root).isDirectory())).toBe(true);
  });

  it('leaves a root that is already there alone', () => {
    const base = scratch();
    const root = path.join(base, 'one');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'keep.md'), 'x', 'utf8');

    ensureDeclaredRoots(allowlist([root]));

    expect(fs.existsSync(path.join(root, 'keep.md'))).toBe(true);
  });

  it('creates a root whose parents do not exist yet', () => {
    const root = path.join(scratch(), 'deep', 'under', 'here');

    ensureDeclaredRoots(allowlist([root]));

    expect(fs.statSync(root).isDirectory()).toBe(true);
  });
});
