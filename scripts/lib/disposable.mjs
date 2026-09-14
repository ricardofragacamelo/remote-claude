/**
 * The build and report directories `pnpm clean` reclaims.
 *
 * Kept apart from the script so the suite can exercise the walk against a temporary tree instead
 * of against the repository it is running in.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Directories removed wherever they appear, except under `node_modules`. Build output, coverage
 * and test reports are all reproducible by a command, which is what makes them safe to delete.
 */
export const DISPOSABLE = [
  'dist',
  'build',
  'coverage',
  'test-results',
  'playwright-report',
  '.dart_tool',
  '.turbo',
  '.vite',
];

/** Never descended into: deleting inside them is `pnpm install`'s job, not this script's. */
const SKIPPED = new Set(['node_modules', '.git']);

/**
 * Disposable directories under `rootDir`, deepest first so a parent never hides a child.
 *
 * @param {string} rootDir
 * @param {ReadonlySet<string>} [skip]
 * @returns {string[]} repository-relative paths
 */
export function findDisposable(rootDir, skip = SKIPPED) {
  /** @type {string[]} */
  const found = [];

  /** @param {string} dir */
  function walk(dir) {
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // A directory that vanished between listing and descending is already clean; a directory
      // we may not read is not ours to delete. Either way there is nothing to do here.
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || skip.has(entry.name)) {
        continue;
      }

      const full = path.join(dir, entry.name);

      if (DISPOSABLE.includes(entry.name)) {
        found.push(path.relative(rootDir, full).split(path.sep).join('/'));
        continue;
      }

      walk(full);
    }
  }

  walk(rootDir);
  return found;
}
