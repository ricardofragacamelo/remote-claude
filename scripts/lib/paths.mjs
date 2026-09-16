/**
 * Where the repository is.
 *
 * Every script needs it and every one of them computed it the same way, which is what the
 * duplication gate objected to. It is also a fact about the layout, not about any one script: the
 * scripts live one directory below the root, and that is true exactly once.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the repository root. */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
