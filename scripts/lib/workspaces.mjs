/**
 * The development workspace allowlist, and the root it points at.
 *
 * The backend refuses to start when a declared root does not exist — deliberately, because a root
 * that vanished is either a typo or a mount that failed, and both are worse discovered at the
 * first session than at boot. That rule makes the development default a little demanding: the
 * directory has to be there before anything comes up.
 *
 * Creating it is exactly the kind of step that gets typed by hand twice and then forgotten once,
 * so it lives here and both `pnpm dev` and `pnpm test:e2e` call it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Absolute path of the allowlist file the repository ships for development. */
export const ALLOWLIST_FILE = path.join(rootDir, 'infra', 'workspace-allowlist.yaml');

/** Roots the shipped allowlist declares, read from the file rather than repeated here. */
export function declaredRoots(file = ALLOWLIST_FILE) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => /^\s*-\s*path:\s*(\S+)\s*$/.exec(line)?.[1])
    .filter((value) => value !== undefined);
}

/**
 * Creates every root the shipped allowlist declares, if it is not already there.
 *
 * @param {string} [file]
 * @returns {string[]} the roots, absolute
 */
export function ensureDeclaredRoots(file = ALLOWLIST_FILE) {
  const roots = declaredRoots(file);

  for (const root of roots) {
    fs.mkdirSync(root, { recursive: true });
  }

  return roots;
}
