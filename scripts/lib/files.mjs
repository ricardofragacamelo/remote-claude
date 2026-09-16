/**
 * Walking a directory tree.
 *
 * Every script that inspects source code needs this, and each one had written its own — which is
 * what the duplication gate objected to. It is also a fact about the repository, not about any
 * one script: `node_modules`, `dist` and generated output are never the subject of a check.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Directories no check ever descends into. */
export const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage']);

/**
 * Every file under [dir] whose name ends in one of [extensions].
 *
 * @param {string} dir absolute path; a directory that does not exist answers an empty list
 * @param {readonly string[]} extensions
 * @param {(name: string) => boolean} [skipDirectory] extra directories to leave out
 * @returns {string[]} absolute paths
 */
export function filesUnder(dir, extensions, skipDirectory = () => false) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return IGNORED_DIRECTORIES.has(entry.name) || skipDirectory(entry.name)
        ? []
        : filesUnder(full, extensions, skipDirectory);
    }

    return extensions.some((extension) => entry.name.endsWith(extension)) ? [full] : [];
  });
}
